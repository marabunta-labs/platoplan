/**
 * PlatoPlan - ResponsiveLayout (Native)
 * Wraps a FlatList with dynamic numColumns based on viewport width.
 * Multi-column grid activates when viewport > 1024px.
 *
 * Requirements: 3.2, 3.5
 */

import React, { useMemo } from 'react';
import { View, FlatList, useWindowDimensions, StyleSheet } from 'react-native';
import type { ListRenderItem } from 'react-native';
import { computeColumnCount, MULTI_COLUMN_BREAKPOINT, DEFAULT_MIN_COLUMN_WIDTH } from './responsive-layout-utils';

export { computeColumnCount, MULTI_COLUMN_BREAKPOINT, DEFAULT_MIN_COLUMN_WIDTH } from './responsive-layout-utils';

export interface ResponsiveLayoutProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  minColumnWidth?: number;
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
  ListFooterComponent?: React.ComponentType | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
  contentContainerStyle?: object;
}

export function ResponsiveLayout<T>({
  data,
  renderItem,
  keyExtractor,
  minColumnWidth = DEFAULT_MIN_COLUMN_WIDTH,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  contentContainerStyle,
}: ResponsiveLayoutProps<T>) {
  const { width } = useWindowDimensions();

  const numColumns = useMemo(
    () => computeColumnCount(width, minColumnWidth),
    [width, minColumnWidth]
  );

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={numColumns}
      key={`columns-${numColumns}`} // Force re-render when column count changes
      columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

const styles = StyleSheet.create({
  columnWrapper: {
    gap: 8,
    paddingHorizontal: 8,
  },
});
