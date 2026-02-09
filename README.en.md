# Proma

Next-generation AI desktop app with integrated agents. Local-first, multi-provider, fully open source.

[中文](./README.md)

![Proma Poster](https://img.erlich.fun/personal-blog/uPic/pb.png)

### Commercial Version
Proma also offers a commercial version. If you want more **cloud features** | **stable and reliable APIs** | **more cost-effective subscription plans** | **a simpler user experience**, you are welcome to download and support the commercial version of Proma: https://proma.cool/download

Proma's core vision is not to replace any specific software. At this stage, Proma mainly delivers foundational infrastructure. Going forward, Proma will continue to expand multi-agent collaboration (for individuals and teams), connections between agents and external services, and the consolidation of Tools and Skills. It will also build the ability to proactively provide tools and suggestions based on user understanding and memory. Proma is evolving rapidly with the help of VibeCoding tools. PRs are welcome!

## Screenshots

Chat mode with multi-model switching and file attachment support.
![Proma Chat Mode](https://img.erlich.fun/personal-blog/uPic/tBXRKI.png)
Agent mode with general-purpose agent capabilities. Supports the full Claude series, MiniMax M2.1, Kimi K2.5, Zhipu GLM, and third-party channels. Elegant, clean, smooth, and stable streaming output.
![Proma Agent Mode](https://img.erlich.fun/personal-blog/uPic/3ZHWyA.png)
Built-in Brainstorming and office suite Skills with MCP support. Automatically helps you find and install Skills through conversation.
![Proma Default Skills and Mcp](https://img.erlich.fun/personal-blog/uPic/PNBOSt.png)
Full-protocol LLM channel support for all domestic and international providers, configured via Base URL + API Key.
![Proma Mutili Provider Support](https://img.erlich.fun/personal-blog/uPic/uPPazd.png)

## Features

- **Multi-Provider Support** — Anthropic, OpenAI, Google, DeepSeek, MiniMax, Kimi, Zhipu GLM, and any OpenAI-compatible endpoint
- **AI Agent Mode** — Autonomous general agent powered by Claude Agent SDK
- **Streaming & Thinking** — Real-time streaming output with extended thinking visualization
- **Rich Rendering** — Mermaid diagrams, syntax-highlighted code blocks, Markdown
- **Attachments & Documents** — Upload images and parse PDF/Office/text files in conversations
- **Local-First** — All data stored locally in `~/.proma/`, no database, fully portable
- **Themes** — Light and dark mode with system preference detection

## Getting Started

Download the latest release for your platform:

**[Download Proma](https://github.com/ErlichLiu/Proma/releases)**

## Configuration

### Adding a Channel

Go to **Settings > Channels**, click **Add Channel**, select a provider, and enter your API Key. Proma will auto-fill the correct API endpoint. Click **Test Connection** to verify, then **Fetch Models** to load available models.

### Agent Mode (Anthropic Only)

Agent mode requires an **Anthropic** channel. After adding one, go to **Settings > Agent** to select your Anthropic channel and preferred model (Claude Sonnet 4 / Opus 4 recommended). The agent uses [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) under the hood.

### Special Provider Endpoints

MiniMax, Kimi (Moonshot), and Zhipu GLM use dedicated API endpoints — these are auto-configured when you select the provider. All three support their **programming membership plans** for API access:

| Provider | Chat Mode | Agent Mode | Note |
|----------|----------|----------|------|
| MiniMax | `https://api.minimaxi.com/v1` | `https://api.minimaxi.com/anthropic`| Supports MiniMax Pro membership |
| Kimi | `https://api.moonshot.cn/v1` | `https://api.moonshot.cn/anthropic`| Supports Moonshot developer plan |
| Zhipu GLM | `https://open.bigmodel.cn/api/paas/v4` | `https://open.bigmodel.cn/api/anthropic`| Supports Zhipu developer plan |

## Tech Stack

- **Runtime** — Bun
- **Framework** — Electron + React 18
- **State** — Jotai
- **Styling** — Tailwind CSS + shadcn/ui
- **Build** — Vite (renderer) + esbuild (main/preload)
- **Language** — TypeScript

## Credits

Proma is built on the shoulders of these great projects:

- [Shiki](https://shiki.style/) — Syntax highlighting
- [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid) — Diagram rendering
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — Inspiration for multi-provider desktop AI
- [Lobe Icons](https://github.com/lobehub/lobe-icons) — AI/LLM brand icon set
- [Craft Agents OSS](https://github.com/lukilabs/craft-agents-oss) — Agent SDK integration patterns

## License

[MIT](./LICENSE)
