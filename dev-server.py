#!/usr/bin/env python3
"""
Combined development server for Trivia Quest.
Serves both static files (app/) and API endpoints from a single server.
"""

import json
import sqlite3
import os
import re
import mimetypes
from pathlib import Path
from functools import wraps

try:
    from flask import Flask, jsonify, request, g, send_from_directory, send_file, Response
    from flask_cors import CORS
except ImportError:
    print("\n  ERROR: Flask is not installed.")
    print("  Run: pip install flask flask-cors")
    print("")
    exit(1)

# Get script directory
SCRIPT_DIR = Path(__file__).parent.absolute()
APP_DIR = SCRIPT_DIR / 'app'
DATA_DIR = SCRIPT_DIR / 'data'

app = Flask(__name__, static_folder=None)

# Configuration
DATABASE_PATH = os.environ.get('DATABASE_PATH', str(DATA_DIR / 'questions.db'))
APP_TITLE = os.environ.get('APP_TITLE', 'Trivia Quest')
MAX_QUESTIONS_PER_REQUEST = 500

# Enable CORS for all origins in development
CORS(app, origins='*', methods=['GET', 'OPTIONS'])

# =============================================================================
# Static File Serving
# =============================================================================

@app.route('/')
def serve_index():
    """Serve the main index.html with APP_TITLE substituted."""
    index_path = APP_DIR / 'index.html'
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    # Substitute ${APP_TITLE} placeholder
    content = content.replace('${APP_TITLE}', APP_TITLE)
    return Response(content, mimetype='text/html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files from app directory."""
    file_path = APP_DIR / filename
    if file_path.exists() and file_path.is_file():
        return send_from_directory(APP_DIR, filename)
    return jsonify({'error': 'File not found'}), 404

# =============================================================================
# Database Connection
# =============================================================================

def get_db():
    """Get database connection for current request."""
    if 'db' not in g:
        if not os.path.exists(DATABASE_PATH):
            return None
        g.db = sqlite3.connect(DATABASE_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(exception):
    """Close database connection at end of request."""
    db = g.pop('db', None)
    if db is not None:
        db.close()

def sanitize_input(text):
    """Sanitize user input to prevent injection attacks."""
    if not isinstance(text, str):
        return text
    sanitized = re.sub(r'[^\w\s\-\.,!?\(\)]', '', text)
    return sanitized[:200]

# =============================================================================
# API Endpoints
# =============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    db = get_db()
    db_status = 'connected' if db else 'not found'
    return jsonify({
        'status': 'healthy',
        'database': db_status,
        'database_path': DATABASE_PATH
    })

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get all available question categories."""
    db = get_db()
    if not db:
        return jsonify({
            'success': False, 
            'error': f'Database not found at {DATABASE_PATH}',
            'categories': []
        }), 404
    
    try:
        cursor = db.execute('''
            SELECT c.id, c.name, c.source_file, c.question_count
            FROM categories c
            ORDER BY c.name
        ''')
        
        categories = []
        for row in cursor.fetchall():
            categories.append({
                'id': row['id'],
                'name': row['name'],
                'description': row['source_file'],
                'questionCount': row['question_count']
            })
        
        return jsonify({
            'success': True,
            'categories': categories
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/categories/<category_name>/questions', methods=['GET'])
def get_questions_by_category(category_name):
    """Get all questions for a specific category."""
    db = get_db()
    if not db:
        return jsonify({'success': False, 'error': 'Database not found'}), 404
    
    try:
        sanitized_name = sanitize_input(category_name)
        
        # Get category
        cat = db.execute(
            'SELECT id, name, source_file FROM categories WHERE name = ?',
            (sanitized_name,)
        ).fetchone()
        
        if not cat:
            return jsonify({'success': False, 'error': 'Category not found'}), 404
        
        # Get pagination parameters
        limit = min(int(request.args.get('limit', 50)), MAX_QUESTIONS_PER_REQUEST)
        offset = int(request.args.get('offset', 0))
        difficulty = request.args.get('difficulty')
        
        # Build query
        query = '''
            SELECT id, question, question_type, answers, incorrect_answers, 
                   difficulty, description, regex_pattern, regex_description
            FROM questions
            WHERE category_id = ?
        '''
        params = [cat['id']]
        
        if difficulty:
            query += ' AND difficulty = ?'
            params.append(sanitize_input(difficulty))
        
        query += ' ORDER BY id LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        
        cursor = db.execute(query, params)
        
        questions = []
        for row in cursor.fetchall():
            q = {
                'id': row['id'],
                'Question': row['question'],
                'Type': row['question_type'],
                'Answers': json.loads(row['answers']) if row['answers'] else [],
                'IncorrectAnswers': json.loads(row['incorrect_answers']) if row['incorrect_answers'] else [],
                'Difficulty': row['difficulty'],
                'Category': cat['name']
            }
            if row['description']:
                q['Description'] = row['description']
            if row['regex_pattern']:
                q['RegexPattern'] = row['regex_pattern']
            if row['regex_description']:
                q['RegexDescription'] = row['regex_description']
            questions.append(q)
        
        # Get total count
        count_query = 'SELECT COUNT(*) FROM questions WHERE category_id = ?'
        count_params = [cat['id']]
        if difficulty:
            count_query += ' AND difficulty = ?'
            count_params.append(sanitize_input(difficulty))
        total = db.execute(count_query, count_params).fetchone()[0]
        
        return jsonify({
            'success': True,
            'category': {
                'name': cat['name'],
                'description': cat['source_file']
            },
            'questions': questions,
            'pagination': {
                'total': total,
                'limit': limit,
                'offset': offset,
                'hasMore': offset + len(questions) < total
            }
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get database statistics."""
    db = get_db()
    if not db:
        return jsonify({'success': False, 'error': 'Database not found'}), 404
    
    try:
        cat_count = db.execute('SELECT COUNT(*) FROM categories').fetchone()[0]
        q_count = db.execute('SELECT COUNT(*) FROM questions').fetchone()[0]
        
        diff_cursor = db.execute('''
            SELECT difficulty, COUNT(*) as count
            FROM questions
            GROUP BY difficulty
        ''')
        difficulties = {row['difficulty']: row['count'] for row in diff_cursor.fetchall()}
        
        return jsonify({
            'success': True,
            'stats': {
                'totalCategories': cat_count,
                'totalQuestions': q_count,
                'difficulties': difficulties
            }
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# =============================================================================
# Error Handlers
# =============================================================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

# =============================================================================
# Main
# =============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    
    print("")
    print("  ╔══════════════════════════════════════╗")
    print("  ║    Trivia Quest Development Server   ║")
    print("  ╚══════════════════════════════════════╝")
    print("")
    print(f"  Title: {APP_TITLE}")
    print(f"  Static files: {APP_DIR}")
    print(f"  Database: {DATABASE_PATH}")
    print("")
    print(f"  Server running at: http://localhost:{port}")
    print("")
    print("  Press Ctrl+C to stop")
    print("")
    
    app.run(host='0.0.0.0', port=port, debug=True)
