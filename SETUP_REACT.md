# Setting Up React with Tailwind, TypeScript, and Shadcn

Because the current workspace is a lightweight HTML + JavaScript website, the React components cannot be run directly within the existing files. If you want to build a standalone React app using these files, follow the setup instructions below.

## 🚀 Step-by-Step Setup

### 1. Initialize a Vite React + TypeScript App
Run the following command in a new directory or inside a sub-folder:
```bash
npx create-vite@latest my-ai-chat --template react-ts
cd my-ai-chat
```

### 2. Install Tailwind CSS and Autoprefixer
Install Tailwind CSS and configure its configuration files:
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3. Initialize Shadcn CLI
Shadcn relies on a components registry config. Initialize it with:
```bash
npx shadcn@latest init
```
During initialization, configure the CLI with the following settings:
- **Style**: Default
- **Base color**: Slate
- **CSS variables**: Yes
- **Tailwind configuration**: `tailwind.config.js`
- **Components alias**: `@/components`
- **Utils alias**: `@/lib/utils`

*Note: It is crucial to have the components folder at `/components` and subcomponents at `/components/ui` because Shadcn CLI's default search paths and standard import aliases (`@/components/ui/...`) target this exact structure.*

### 4. Install Component Dependencies
Run the command below to install the packages required by these components:
```bash
npm install lucide-react @radix-ui/react-slot class-variance-authority
```

### 5. Copy the React Files
Move the files you requested into the project directory:
- Copy [button.tsx](file:///c:/Users/Admin/OneDrive/Desktop/mcc/components/ui/button.tsx) and [textarea.tsx](file:///c:/Users/Admin/OneDrive/Desktop/mcc/components/ui/textarea.tsx) to `/components/ui/`
- Copy [ruixen-moon-chat.tsx](file:///c:/Users/Admin/OneDrive/Desktop/mcc/components/ui/ruixen-moon-chat.tsx) to `/components/ui/`
- Copy [demo.tsx](file:///c:/Users/Admin/OneDrive/Desktop/mcc/demo.tsx) into your pages or router system (e.g. `/src/App.tsx`).

### 6. Start the Local Server
```bash
npm run dev
```
This will start a Vite dev server hosting the React components.
