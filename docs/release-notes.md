# Jelly 0.1.1

Jelly is a desktop Obsidian AI assistant named after a cat.

This patch addresses the initial community review: it adds an English README, uses the native settings heading, simplifies the Open command, respects custom vault configuration folders, uses the host DOM creation helper, and makes clean builds use committed license notices instead of local dependency-store paths.

- Configure an API key, API endpoint and model from the settings tab.
- Chat with streaming Markdown replies and restore local conversations.
- Read Markdown and text-based PDFs from the current vault.
- Create, edit and delete Markdown files when requested.
- Run the Agent Service in an independent process using Obsidian's bundled runtime.

Your API key is stored through Obsidian SecretStorage. Model requests send conversation context and tool results to your configured provider, which may charge usage fees. File deletion is permanent; this release has no per-operation confirmation dialog or undo.

Desktop only. Requires Obsidian 1.11.4+ and a desktop installer with Node 20.19+. The packaged runtime has been tested on macOS with Electron 43.3.0. Windows and Linux have not yet been validated.

For manual installation, extract the `jelly` folder from the ZIP into your vault's `.obsidian/plugins/` directory, enable Jelly, and configure your provider under Settings → Jelly.
