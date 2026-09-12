# VMC Launcher

VMC Launcher lets you host a Minecraft server on your own computer: no terminal, no config files, no headaches. Download, click, play.

**Free. Open source. No telemetry.**

![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Version](https://img.shields.io/badge/version-0.1.0--beta-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

## What it does

- **One-click server creation**: choose a server type and version, the launcher handles the rest (Java included).
- **No terminal needed**: start, stop, and configure your server entirely from the UI.
- **Built-in console**: send commands and watch logs in real time.
- **Plugin management**: browse and install plugins from Modrinth, Hangar, and Pumpkin Market directly from the app.
- **File editor**: edit config files without leaving the launcher.
- **Supports Paper, Fabric, and Pumpkin**: pick what works for your friends.
- **English & French**.

## Technology Stack

- **Backend**: [Rust](https://www.rust-lang.org/) + [Tauri 2](https://v2.tauri.app/)
- **Frontend**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)

## Contributing / Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [Rust](https://www.rust-lang.org/tools/install) stable
- Tauri system dependencies: [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/Open-VMC/VMCLauncher.git
cd VMCLauncher
npm install
npx tauri dev      # development
npx tauri build    # production build
```

## CI/CD

Builds are automated via **GitHub Actions** (workflow dispatch: macOS, Windows, Linux or all).

## License

GNU General Public License v3.0, see [LICENSE](LICENSE).

---

Built with ❤️ by [OpenVMC](https://github.com/Open-VMC)
