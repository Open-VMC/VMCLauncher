# VMC Launcher

VMC Launcher is a modern, high-performance desktop application designed for managing Minecraft servers. Built with Electron, React, and Vite, it offers a premium experience for server administrators with integrated tools for file editing, plugin management, and automated runtime handling.

![License](https://img.shields.io/badge/license-GPL--3.0-blue)
![Version](https://img.shields.io/badge/version-0.1.0--beta-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

## Features

- **Multi-Platform Distribution**: Ready for macOS (Universal), Windows, and Linux.
- **Server Management**: Create and manage Paper servers with ease.
- **Integrated Java Manager**: Automatically downloads and manages required OpenJDK runtimes.
- **Advanced File Explorer**: A robust file manager with Drag & Drop support.
- **High-Performance Code Editor**: Built-in editor with syntax highlighting for config files (powered by PrismJS).
- **Plugin Marketplaces**: Direct integration with Modrinth and Hangar Paper.
- **Stunning UI**: Modern glassmorphism design powered by Framer Motion.
- **Multi-Language Support**: Fully localized in English and French and expandable to any language.

## Technology Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: Vanilla CSS with [Framer Motion](https://www.framer.com/motion/) for animations.
- **Build Tool**: [Electron Builder](https://www.electron.build/)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- npm (v10 or higher)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Open-VMC/VMCLauncher.git
   cd VMCLauncher
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Run the launcher in development mode with hot-reload:
```bash
npm run dev
```

### Building for Production

To build the application for your current platform:
```bash
npm run dist
```

## Distribution & CI/CD

We use **GitHub Actions** to automate the build process for all platforms. You can trigger builds manually:

1. Navigate to the **Actions** tab in the repository.
2. Select the **"Build and Release"** workflow.
3. Click **"Run workflow"** and choose your target platform (macOS, Windows, Linux, or all).
4. Download the generated executables from the **Artifacts** section at the bottom of the run summary.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ by [OpenVMC](https://github.com/Open-VMC)
