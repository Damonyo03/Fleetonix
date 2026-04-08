# CodeRabbit Quick-Start Guide for Fleetonix

I have integrated CodeRabbit AI into your project! This guide will help you use it for code analysis and review.

## 🚀 Getting Started

Once you've installed the **CodeRabbit GitHub App**, it will automatically review every new Pull Request (PR) you create.

### Key Features
- **Automatic Summary**: Every PR gets a high-level summary of what was changed.
- **Line-by-Line Review**: The AI identifies bugs, security risks, and optimization opportunities in your Kotlin and JavaScript code.
- **Interactive Chat**: You can "talk" to the PR via comments.

---

## 💬 Useful Commands

You can use these commands in GitHub comments to interact with CodeRabbit:

| Command | Action |
| :--- | :--- |
| `@coderabbitai review` | Triggers a fresh review of the entire PR. |
| `@coderabbitai summary` | Generates or updates the PR summary. |
| `@coderabbitai chat <question>` | Ask specific questions about the code logic. |
| `@coderabbitai resolve` | Marks all CodeRabbit comments as resolved. |

---

## 🎯 Fleetonix Specific Focus
The AI has been configured via [`.coderabbit.yaml`](file:///c:/Users/user/Downloads/Projects/Fleetonix/.coderabbit.yaml) to prioritize:
- **Firebase Sync**: Ensuring real-time listeners are efficient.
- **Android Background Services**: Checking `LocationService.kt` for potential battery drain or leaks.
- **UI Aesthetics**: Verifying that new UI components match the "Midnight" and "CardBlue" design system.

---

## 💡 Professional Tip
If the AI makes a suggestion you like, you can often reply with **"Can you fix this for me?"** and it will provide the refactored code block ready for you to copy.
