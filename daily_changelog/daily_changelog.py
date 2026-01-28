#!/usr/bin/env python3
"""
Daily Changelog Generator
Runs every weekday at 10am to summarize yesterday's git changes.
Saves a txt file to the Desktop.
"""

import subprocess
import os
from datetime import datetime, timedelta
from pathlib import Path
import schedule
import time
import anthropic

# Configuration
REPO_PATH = "/Users/seankearney/BadDateDemo"
DESKTOP_PATH = Path.home() / "Desktop"
CHANGELOG_FOLDER = DESKTOP_PATH / "Daily Changelog"

def get_api_key():
    """Get API key from environment or .env file."""
    # First try environment variable
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    
    # Fall back to reading from .env file
    env_path = Path(REPO_PATH) / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.startswith("VITE_ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return ""

ANTHROPIC_API_KEY = get_api_key()

def get_yesterdays_commits():
    """Get all commit messages from yesterday."""
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    today = datetime.now().strftime("%Y-%m-%d")
    
    try:
        result = subprocess.run(
            [
                "git", "log",
                f"--since={yesterday} 00:00:00",
                f"--until={today} 00:00:00",
                "--pretty=format:%s%n%b---",
            ],
            cwd=REPO_PATH,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error getting git log: {e}")
        return ""

def summarize_with_claude(commit_messages):
    """Use Claude to create a narrative summary of yesterday's work."""
    if not ANTHROPIC_API_KEY:
        return "Error: ANTHROPIC_API_KEY not set in environment variables."
    
    if not commit_messages:
        return "No commits found from yesterday."
    
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    
    prompt = f"""Here are the git commit messages from yesterday's work on a multiplayer dating game project called "Bad Date Demo":

{commit_messages}

Create a narrative daily summary for a general (non-technical) audience. Format:

1. **Theme line**: Start with "Yesterday's Focus: [Theme]" - identify the overarching goal or improvement theme (e.g., "Making the Date Feel Real", "Improving Player Experience", "Polish and Bug Fixes")

2. **Theme description**: 1-2 sentences explaining what the developer was trying to accomplish at a high level.

3. **Bulleted changes**: 4-8 bullets (combine similar changes), each formatted as:
   • **Short title** — Plain English explanation of what changed and why it matters to players

Rules:
- Write for someone who doesn't code - no technical jargon
- Focus on the player experience and why changes matter
- Each bullet should feel like "what improved" not "what code changed"
- Be concise but descriptive
- If commits mention things like "timers", "UI", "prompts", "LLM" - translate these to player-facing benefits

Example bullet style:
• **Conversations feel more natural** — The date no longer fires off questions like an interview. Instead, she reacts and shares her own stories.

Return the formatted summary."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text
    except Exception as e:
        return f"Error calling Claude API: {e}"

def generate_changelog():
    """Main function to generate and save the changelog."""
    print(f"[{datetime.now()}] Generating daily changelog...")
    
    # Get yesterday's date for the filename
    yesterday = (datetime.now() - timedelta(days=1))
    date_str = yesterday.strftime("%Y-%m-%d")
    day_name = yesterday.strftime("%A")
    
    # Get commits and summarize
    commits = get_yesterdays_commits()
    
    if not commits:
        print("No commits found from yesterday. Skipping.")
        return
    
    summary = summarize_with_claude(commits)
    
    # Create the output
    output = f"""Bad Date Demo - Daily Summary
{day_name}, {yesterday.strftime("%B %d, %Y")}
{'=' * 50}

{summary}

---
Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
"""
    
    # Create Daily Changelog folder if it doesn't exist
    CHANGELOG_FOLDER.mkdir(exist_ok=True)
    
    # Save to Daily Changelog folder
    filename = f"changelog_{date_str}.txt"
    filepath = CHANGELOG_FOLDER / filename
    
    with open(filepath, "w") as f:
        f.write(output)
    
    print(f"Changelog saved to: {filepath}")

def run_scheduler():
    """Run the scheduler for weekday 10am execution."""
    # Schedule for weekdays at 10am
    schedule.every().monday.at("10:00").do(generate_changelog)
    schedule.every().tuesday.at("10:00").do(generate_changelog)
    schedule.every().wednesday.at("10:00").do(generate_changelog)
    schedule.every().thursday.at("10:00").do(generate_changelog)
    schedule.every().friday.at("10:00").do(generate_changelog)
    
    print("Daily Changelog Generator started!")
    print("Scheduled to run every weekday at 10:00 AM")
    print("Press Ctrl+C to stop.\n")
    
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--now":
        # Run immediately for testing
        print("Running changelog generation now (test mode)...")
        generate_changelog()
    else:
        # Run the scheduler
        run_scheduler()
