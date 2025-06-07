# Crawl Matter Certis

A React + Electron application for crawling Matter certification data, built with clean architecture principles and modern development practices.

## 🏗️ Architecture

This application follows a clean, modular architecture:

- **Domain Stores**: Core business logic and state management
- **React Hooks**: Clean integration layer for React components
- **Modular Components**: Reusable, well-tested UI components
- **Type-Safe Utilities**: Shared utilities with full TypeScript support

## 📁 Project Structure

```
src/ui/
├── components/          # Modular, reusable components
│   ├── demo/           # Domain store demo components
│   ├── control/        # Control components
│   ├── layout/         # Layout components
│   └── ...
├── hooks/              # Custom React hooks
├── utils/              # Type-safe utility functions
└── ...

documents/              # Comprehensive documentation
├── architecture/       # System design documents
├── development/        # Development guides
├── refactoring/        # Improvement documentation
├── requirements/       # Project requirements
└── guides/            # User guides
```

## 🚀 Recent Major Updates

### ✅ Project Structure Modernization (2025-05-25)
- **Component Modularization**: DomainStoreDemo split into 5 reusable components
- **Documentation Reorganization**: All docs moved to `/documents` with clear categorization
- **Type System Integration**: Shared TypeScript types across components
- **Clean Code Implementation**: Following Clean Code principles throughout

### ✅ Domain Store Hooks Integration
- React hooks for accessing domain stores
- Type-safe state management integration
- Clean separation of concerns

See [`documents/refactoring/project-structure-improvement-complete.md`](documents/refactoring/project-structure-improvement-complete.md) for detailed changes.

## Technologies

- React + TypeScript + Vite
- Electron
- Nanostores for state management
- Tailwind CSS for styling

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
