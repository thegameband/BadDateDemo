# LLM Prompt Chain System

This folder contains modular prompts that are chained together when generating character responses.

## Prompt Files

| File | Purpose | Used For |
|------|---------|----------|
| `01_CLASSIFY_ATTRIBUTE.md` | Determine if attribute is visible or not | First step - classification |
| `02_AVATAR_NEW_ATTRIBUTE.md` | Avatar discovers new trait | Avatar responses |
| `03_AVATAR_PHYSICAL_TRAIT.md` | Additional instructions for physical traits | Visible attributes only |
| `04_DATER_VISIBLE_REACTION.md` | Dater reacts to what they SEE | Visible attributes only |
| `05_DATER_INFER_REACTION.md` | Dater infers from what Avatar SAID | Non-visible attributes only |
| `06_AVATAR_CORE_PERSONALITY.md` | Avatar's fundamental personality | ALL Avatar responses |
| `07_RESPONSE_RULES.md` | Formatting and length rules | ALL responses |
| `08_GENZ_DATING_SPEECH.md` | Gen-Z reality TV speech patterns | ALL dater responses |

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   NEW ATTRIBUTE ADDED                        │
│                  (e.g., "is on fire")                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   PROMPT 01:          │
                │   Classify Attribute  │
                │   → VISIBLE or NOT?   │
                └───────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
        VISIBLE                        NON-VISIBLE
            │                               │
            ▼                               ▼
┌───────────────────────┐      ┌───────────────────────┐
│   AVATAR RESPONSE:    │      │   AVATAR RESPONSE:    │
│                       │      │                       │
│   • Prompt 02 (new)   │      │   • Prompt 02 (new)   │
│   • Prompt 03 (phys)  │      │   • Prompt 06 (core)  │
│   • Prompt 06 (core)  │      │   • Prompt 07 (rules) │
│   • Prompt 07 (rules) │      │                       │
└───────────────────────┘      └───────────────────────┘
            │                               │
            ▼                               ▼
┌───────────────────────┐      ┌───────────────────────┐
│   DATER RESPONSE:     │      │   DATER RESPONSE:     │
│                       │      │                       │
│   • Prompt 04 (see)   │      │   • Prompt 05 (infer) │
│   • Prompt 07 (rules) │      │   • Prompt 07 (rules) │
└───────────────────────┘      └───────────────────────┘
```

---

## Prompt Combinations

### For AVATAR (Visible Attribute)
```
[Prompt 02: New Attribute Discovery]
+
[Prompt 03: Physical Trait Display]
+
[Prompt 06: Core Personality]
+
[Prompt 07: Response Rules]
```

### For AVATAR (Non-Visible Attribute)
```
[Prompt 02: New Attribute Discovery]
+
[Prompt 06: Core Personality]
+
[Prompt 07: Response Rules]
```

### For DATER (Visible Attribute)
```
[Prompt 04: React to Visible]
+
[Prompt 08: Gen-Z Dating Speech Register]
+
[Prompt 05B: Reaction Style]
+
[Prompt 07: Response Rules]
```

### For DATER (Non-Visible Attribute)
```
[Prompt 05: Infer from Words]
+
[Prompt 08: Gen-Z Dating Speech Register]
+
[Prompt 05B: Reaction Style]
+
[Prompt 07: Response Rules]
```

---

## Implementation Example

```javascript
async function generateAvatarResponse(attribute, isVisible, context) {
  // Build prompt chain
  let prompt = loadPrompt('02_AVATAR_NEW_ATTRIBUTE', { attribute, ...context })
  
  if (isVisible) {
    prompt += '\n\n' + loadPrompt('03_AVATAR_PHYSICAL_TRAIT', { attribute })
  }
  
  prompt += '\n\n' + loadPrompt('06_AVATAR_CORE_PERSONALITY', { 
    avatarName: context.avatarName,
    allAttributes: context.allAttributes 
  })
  
  prompt += '\n\n' + loadPrompt('07_RESPONSE_RULES')
  
  return await callLLM(prompt)
}

async function generateDaterResponse(attribute, isVisible, context) {
  let prompt
  
  if (isVisible) {
    prompt = loadPrompt('04_DATER_VISIBLE_REACTION', { attribute, ...context })
  } else {
    prompt = loadPrompt('05_DATER_INFER_REACTION', { ...context })
  }
  
  prompt += '\n\n' + loadPrompt('07_RESPONSE_RULES')
  
  return await callLLM(prompt)
}
```

---

## Variable Placeholders

Each prompt uses placeholders in `[brackets]` that should be replaced:

| Placeholder | Description |
|-------------|-------------|
| `[attribute]` | The new attribute being added |
| `[avatarLastMessage]` | What the Avatar just said |
| `[daterLastMessage]` | What the Dater just said |
| `[avatarName]` | The Avatar's name |
| `[allAttributes]` | List of all Avatar's current traits |
| `[allVisibleAttributes]` | List of traits the Dater can see |
| `[conversationHistory]` | Recent conversation context |
| `[daterPersonality]` | The Dater's personality profile |

---

## Why Modular Prompts?

1. **Easier to understand** - Each prompt has one job
2. **Easier to test** - Test each prompt independently
3. **Easier to modify** - Change one aspect without affecting others
4. **Flexible combinations** - Mix and match for different scenarios
5. **Cleaner code** - Prompt logic is separated from application logic
