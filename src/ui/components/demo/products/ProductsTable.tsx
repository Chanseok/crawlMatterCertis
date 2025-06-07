import React from 'react';
import { Table, Badge } from '../../common';
import type { TableColumn } from '../../common';
import { Product, SaveResult } from '../types';

interface ProductsTableProps {
  products: Product[];
  isSaving: boolean;
  saveResult: SaveResult | null;
  loading?: boolean;
  onProductClick?: (product: Product) => void;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  isSaving,
  saveResult,
  loading = false,
  onProductClick
}) => {
  const columns: TableColumn<Product>[] = [
    {
      key: 'id',
      header: 'ID',
      width: '100px',
      render: (value) => value || 'N/A'
    },
    {
      key: 'model',
      header: 'Model',
      sortable: true,
      render: (value) => value || 'N/A'
    },
    {
      key: 'manufacturer',
      header: 'Manufacturer',
      sortable: true,
      render: (value) => value || 'N/A'
    },
    {
      key: 'category',
      header: 'Category',
      render: (value) => value ? (
        <Badge variant="secondary" size="sm">
          {value}
        </Badge>
      ) : 'N/A'
    },
    {
      key: 'status',
      header: 'Status',
      render: (_value, product) => {
        // Determine status based on product data
        const hasRequiredFields = product.model && product.manufacturer;
        const status = hasRequiredFields ? 'verified' : 'incomplete';
        
        return (
          <Badge 
            variant={status === 'verified' ? 'success' : 'warning'}
            size="sm"
          >
            {status === 'verified' ? '✓ Verified' : '⚠ Incomplete'}
          </Badge>
        );
      }
    }
  ];

  const getSaveStatusBadge = () => {
    if (isSaving) {
      return <Badge variant="primary" pulse>Saving...</Badge>;
    }
    if (saveResult?.success) {
      return <Badge variant="success">✓ Saved successfully</Badge>;
    }
    if (saveResult?.success === false) {
      return <Badge variant="danger">✗ Save failed</Badge>;
    }
    return null;
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Products</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {products.length} product{products.length !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {getSaveStatusBadge()}
        </div>
      </div>
      
      <Table
        data={products}
        columns={columns}
        loading={loading}
        emptyMessage="No products found. Try adjusting your search criteria."
        onRowClick={onProductClick}
        className="shadow-sm"
      />
    </div>
  );
};

export default ProductsTable;
