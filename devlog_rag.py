#!/usr/bin/env python3
"""
DevLog RAG - Semantic search across development logs.

Usage:
    python devlog_rag.py ingest              # Index .devlog/*.md files
    python devlog_rag.py query "search term" # Search logs
    python devlog_rag.py query "term" --type DEAD_END --days 30 --context

Requirements:
    pip install chromadb sentence-transformers
"""

import argparse
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


# Event types recognized by the DevLog protocol
EVENT_TYPES = [
    'DECISION', 'DEAD_END', 'CONSTRAINT', 'MILESTONE', 'FILE',
    'BLOCKER', 'INSIGHT', 'STATE', 'FOCUS', 'PIVOT', 'HANDOFF'
]

# Event type pattern
EVENT_PATTERN = re.compile(
    r'###\s+(\d{1,2}:\d{2})\s+(' + '|'.join(EVENT_TYPES) + r')\n(.*?)(?=###|\Z)',
    re.DOTALL
)

# Date pattern for log files
DATE_PATTERN = re.compile(r'(\d{4}-\d{2}-\d{2})')


def get_devlog_dir():
    """Get the .devlog directory in current working directory."""
    return Path.cwd() / '.devlog'


def get_db_path():
    """Get the ChromaDB path for current project."""
    return Path.cwd() / '.devlog' / '.chromadb'


def parse_log_file(filepath: Path) -> list[dict]:
    """Parse a devlog file into structured events."""
    events = []
    content = filepath.read_text(encoding='utf-8')

    # Extract date from filename
    date_match = DATE_PATTERN.search(filepath.name)
    log_date = date_match.group(1) if date_match else 'unknown'

    for match in EVENT_PATTERN.finditer(content):
        time_str, event_type, body = match.groups()
        events.append({
            'date': log_date,
            'time': time_str.strip(),
            'type': event_type,
            'content': body.strip(),
            'source': str(filepath),
            'id': f"{log_date}_{time_str.replace(':', '')}_{event_type}"
        })

    return events


def ingest_logs(devlog_dir: Path, db_path: Path):
    """Ingest all devlog files into ChromaDB."""
    if not HAS_DEPS:
        print("ERROR: Missing dependencies. Run: pip install chromadb sentence-transformers")
        sys.exit(1)

    if not devlog_dir.exists():
        print(f"No .devlog directory found at {devlog_dir}")
        sys.exit(1)

    # Initialize embedding model
    print("Loading embedding model...")
    model = SentenceTransformer('all-MiniLM-L6-v2')

    # Initialize ChromaDB
    db_path.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(db_path))

    # Get or create collection
    collection = client.get_or_create_collection(
        name="devlog_events",
        metadata={"hnsw:space": "cosine"}
    )

    # Parse all log files
    log_files = list(devlog_dir.glob('*.md'))
    print(f"Found {len(log_files)} log files")

    all_events = []
    for log_file in log_files:
        events = parse_log_file(log_file)
        all_events.extend(events)

    if not all_events:
        print("No events found in log files")
        return

    print(f"Parsed {len(all_events)} events")

    # Get existing IDs to avoid duplicates
    existing = set()
    try:
        existing_data = collection.get()
        existing = set(existing_data['ids'])
    except Exception:
        pass

    # Filter new events
    new_events = [e for e in all_events if e['id'] not in existing]

    if not new_events:
        print("All events already indexed")
        return

    print(f"Indexing {len(new_events)} new events...")

    # Create embeddings
    texts = [f"{e['type']}: {e['content']}" for e in new_events]
    embeddings = model.encode(texts).tolist()

    # Add to collection
    collection.add(
        ids=[e['id'] for e in new_events],
        embeddings=embeddings,
        documents=texts,
        metadatas=[{
            'date': e['date'],
            'time': e['time'],
            'type': e['type'],
            'source': e['source']
        } for e in new_events]
    )

    print(f"Successfully indexed {len(new_events)} events")


def query_logs(query: str, event_type: str = None, days: int = None,
               n_results: int = 5, context: bool = False):
    """Query the devlog database."""
    if not HAS_DEPS:
        print("ERROR: Missing dependencies. Run: pip install chromadb sentence-transformers")
        sys.exit(1)

    db_path = get_db_path()
    if not db_path.exists():
        print("No index found. Run 'devlog_rag.py ingest' first.")
        sys.exit(1)

    # Initialize
    model = SentenceTransformer('all-MiniLM-L6-v2')
    client = chromadb.PersistentClient(path=str(db_path))

    try:
        collection = client.get_collection("devlog_events")
    except Exception:
        print("No devlog collection found. Run 'devlog_rag.py ingest' first.")
        sys.exit(1)

    # Build where clause
    where = {}
    where_clauses = []

    if event_type:
        where_clauses.append({"type": event_type})

    if days:
        cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
        where_clauses.append({"date": {"$gte": cutoff}})

    if len(where_clauses) == 1:
        where = where_clauses[0]
    elif len(where_clauses) > 1:
        where = {"$and": where_clauses}

    # Query
    query_embedding = model.encode([query]).tolist()

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=n_results,
        where=where if where else None,
        include=["documents", "metadatas", "distances"]
    )

    if not results['ids'][0]:
        print("No matching events found")
        return

    # Format output
    if context:
        # Formatted for Claude context injection
        print("## Relevant DevLog History\n")
        for i, (doc, meta, dist) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        )):
            relevance = 1 - dist  # Convert distance to similarity
            print(f"### {meta['date']} {meta['time']} [{meta['type']}] (relevance: {relevance:.2f})")
            print(doc.split(': ', 1)[1] if ': ' in doc else doc)
            print()
    else:
        # Human readable
        for i, (doc, meta, dist) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        )):
            relevance = 1 - dist
            print(f"\n{'='*60}")
            print(f"[{i+1}] {meta['date']} {meta['time']} | {meta['type']} | relevance: {relevance:.2%}")
            print(f"Source: {meta['source']}")
            print(f"{'-'*60}")
            print(doc.split(': ', 1)[1] if ': ' in doc else doc)


def main():
    parser = argparse.ArgumentParser(
        description='DevLog RAG - Semantic search across development logs'
    )
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Ingest command
    ingest_parser = subparsers.add_parser('ingest', help='Index devlog files')
    ingest_parser.add_argument('--path', type=str, help='Path to .devlog directory')

    # Query command
    query_parser = subparsers.add_parser('query', help='Search devlogs')
    query_parser.add_argument('search', type=str, help='Search query')
    query_parser.add_argument('--type', type=str,
                             choices=EVENT_TYPES,
                             help='Filter by event type')
    query_parser.add_argument('--days', type=int, help='Limit to last N days')
    query_parser.add_argument('-n', type=int, default=5, help='Number of results')
    query_parser.add_argument('--context', action='store_true',
                             help='Format output for Claude context')

    args = parser.parse_args()

    if args.command == 'ingest':
        devlog_dir = Path(args.path) if args.path else get_devlog_dir()
        db_path = devlog_dir / '.chromadb'
        ingest_logs(devlog_dir, db_path)

    elif args.command == 'query':
        query_logs(
            args.search,
            event_type=args.type,
            days=args.days,
            n_results=args.n,
            context=args.context
        )

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
