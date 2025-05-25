# Domain Store Hooks Implementation

This project now includes React hooks for accessing domain stores. These hooks provide a cleaner way to access the state and actions from the domain stores in your React components.

## Architecture

The application follows a clean architecture approach with the following layers:

- **Domain Stores**: Core business logic and state management using Nanostores (in `src/ui/stores/domain/`)
- **React Hooks**: React integration layer (in `src/ui/hooks/`)
- **Components**: UI layer (in `src/ui/components/`)

## Available Domain Store Hooks

- `useDatabaseStore`: Access to database operations and state
- `useTaskStore`: Access to task management operations and state 
- `useLogStore`: Access to logging operations and state
- `useUIStore`: Access to UI state management
- `useCrawlingStore`: Access to crawling operations and state

## Usage

Import and use the hooks in your components:

```tsx
import { useDatabaseStore, useLogStore } from '../hooks';

function MyComponent() {
  const { products, loadProducts, saveProducts } = useDatabaseStore();
  const { addLog } = useLogStore();
  
  // Use the state and actions
}
```

## Demo Component

To see all hooks in action, check out the demo component:

```
src/ui/components/DomainStoreDemo.tsx
```

## Testing

Run UI tests with:

```bash
npm run test:ui
```

## Documentation

For detailed documentation on using these hooks, including a migration guide, see:

```
src/ui/hooks/README.md
```
