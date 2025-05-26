# Domain Store Hooks Implementation

## Overview

This implementation provides React hooks that integrate with MobX domain stores following a centralized state management pattern. These hooks enable React components to easily access and use domain stores with proper type safety and React integration.

## Hooks Structure

All domain store hooks follow a consistent pattern:

1. **State Access**: Provides reactive access to store state using MobX observers
2. **Action Methods**: Provides methods to interact with the domain store
3. **Automatic Reactivity**: Components automatically re-render when observed data changes

## Available Hooks

- `useDatabaseStore`: Access to database operations and state
- `useTaskStore`: Access to task management operations and state
- `useLogStore`: Access to logging operations and state
- `useUIStore`: Access to UI state management
- `useCrawlingStore`: Access to crawling operations and state

## Usage Example

```tsx
import { useDatabaseStore } from '../hooks';
import { observer } from 'mobx-react-lite';

const ProductList = observer(() => {
  const { 
    products, 
    isLoading, 
    loadProducts, 
    searchProducts 
  } = useDatabaseStore();
  
  useEffect(() => {
    loadProducts({ page: 1, limit: 100 });
  }, [loadProducts]);
  
  return (
    <div>
      {isLoading ? (
        <p>Loading products...</p>
      ) : (
        <ul>
          {products.map(product => (
            <li key={product.id}>{product.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
});
```

## Migration Guide

### Converting from Legacy Nanostores

If your component currently used the legacy nanostores implementation, follow these steps to migrate to the new MobX hooks:

#### Before:

```tsx
import { useStore } from '@nanostores/react';
import { databaseStore } from '../stores/domain/DatabaseStore';

function MyComponent() {
  const products = useStore(databaseStore.products);
  const loading = useStore(databaseStore.loading);
  
  const handleSave = async () => {
    await databaseStore.saveProducts(products);
  };
  
  // ...
}
```

#### After:

```tsx
import { useDatabaseStore } from '../hooks';
import { observer } from 'mobx-react-lite';

const MyComponent = observer(() => {
  const { products, isLoading, saveProducts } = useDatabaseStore();
  
  const handleSave = async () => {
    await saveProducts(products);
  };
  
  // ...
});
```

### Converting from Older ViewModels

If your component uses one of the older ViewModel hooks, follow these steps to migrate to the new domain store hooks:

#### Before:

```tsx
import { useDatabaseViewModel } from '../hooks/useDatabaseViewModel';

function MyComponent() {
  const { isSaving, saveResult, error, saveProducts } = useDatabaseViewModel();
  
  // ...
}
```

#### After:

```tsx
import { useDatabaseStore } from '../hooks';
import { observer } from 'mobx-react-lite';

const MyComponent = observer(() => {
  const { isSaving, saveResult, saveProducts } = useDatabaseStore();
  
  // ...
});
```

Note: All components using domain store hooks should be wrapped with `observer()` for automatic reactivity.

## Benefits

1. **Unified Pattern**: All hooks follow the same structure and patterns
2. **Type Safety**: Full TypeScript support with proper typing
3. **Automatic Reactivity**: Components automatically re-render when observed data changes
4. **Performance**: Only re-renders components when the actually used state changes
5. **Testing**: Easy to mock for unit testing
6. **Clean Components**: Separates UI from business logic

## Design Philosophy

These hooks implement a centralized state management pattern using MobX, providing a clean interface between React components and business logic stores.

## Testing

To run tests for the domain store hooks:

```bash
npm run test:ui
```

A complete demo component showcasing the use of all hooks is available at: `/src/ui/components/DomainStoreDemo.tsx`
