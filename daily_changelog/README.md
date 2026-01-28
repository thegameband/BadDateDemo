# Daily Changelog Generator

A simple Python app that runs every weekday at 10am to summarize yesterday's git changes into a bulleted list and saves it to your Desktop.

## Setup

1. **Install dependencies:**
   ```bash
   cd daily_changelog
   pip install -r requirements.txt
   ```

2. **Set your Anthropic API key:**
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```
   
   Or add it to your `~/.zshrc` or `~/.bash_profile`:
   ```bash
   echo 'export ANTHROPIC_API_KEY="your-api-key-here"' >> ~/.zshrc
   source ~/.zshrc
   ```

## Usage

### Run the scheduler (weekdays at 10am):
```bash
python daily_changelog.py
```

### Test it now (generate changelog immediately):
```bash
python daily_changelog.py --now
```

## Output

The script creates a file on your Desktop named `changelog_YYYY-MM-DD.txt` containing:
- Date of the changes
- Bulleted summary (max 10 bullets)
- Similar changes combined into single bullets

## Running in Background

To keep it running in the background, you can:

### Option 1: Use nohup
```bash
nohup python daily_changelog.py > /dev/null 2>&1 &
```

### Option 2: Create a macOS Launch Agent (recommended)

Create `~/Library/LaunchAgents/com.seankearney.dailychangelog.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.seankearney.dailychangelog</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/seankearney/BadDateDemo/daily_changelog/daily_changelog.py</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Weekday</key><integer>1</integer>
            <key>Hour</key><integer>10</integer>
            <key>Minute</key><integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>2</integer>
            <key>Hour</key><integer>10</integer>
            <key>Minute</key><integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>3</integer>
            <key>Hour</key><integer>10</integer>
            <key>Minute</key><integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>4</integer>
            <key>Hour</key><integer>10</integer>
            <key>Minute</key><integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key><integer>5</integer>
            <key>Hour</key><integer>10</integer>
            <key>Minute</key><integer>0</integer>
        </dict>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>ANTHROPIC_API_KEY</key>
        <string>your-api-key-here</string>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
```

Then load it:
```bash
launchctl load ~/Library/LaunchAgents/com.seankearney.dailychangelog.plist
```
