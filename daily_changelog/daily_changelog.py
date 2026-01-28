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
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")  # Set this in your environment

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
    """Use Claude to summarize the commits into a bulleted list."""
    if not ANTHROPIC_API_KEY:
        return "Error: ANTHROPIC_API_KEY not set in environment variables."
    
    if not commit_messages:
        return "No commits found from yesterday."
    
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    
    prompt = f"""Here are the git commit messages from yesterday's work on a dating game project:

{commit_messages}

Please create a bulleted list summarizing the broad changes made. Rules:
- Maximum 10 bullets
- Combine similar tasks into single bullets (e.g., multiple timer changes = one bullet about timer changes)
- Focus on what was accomplished, not technical details
- Keep each bullet concise but descriptive
- Start each bullet with a bold topic/category

Return ONLY the bulleted list, nothing else."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
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
    output = f"""Bad Date Demo - Daily Changelog
{day_name}, {yesterday.strftime("%B %d, %Y")}
{'=' * 50}

{summary}

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
"""
    
    # Save to desktop
    filename = f"changelog_{date_str}.txt"
    filepath = DESKTOP_PATH / filename
    
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
