/**
 * PlatoPlan - ResponsiveLayout (Web)
 * Uses CSS grid for multi-column layout on web.
 * Multi-column grid activates when viewport > 1024px.
 *
 * Requirements: 3.2, 3.5
 */

import React, { useMemo } from 'react';
import { View, useWindowDimensions, StyleSheet, ScrollView } from 'react-native';
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

  const isMultiColumn = width > MULTI_COLUMN_BREAKPOINT;

  const gridStyle = useMemo(
    () =>
      isMultiColumn
        ? {
            display: 'grid' as const,
            gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
            gap: 8,
            padding: 8,
          }
        : undefined,
    [isMultiColumn, minColumnWidth]
  );

  if (data.length === 0 && ListEmptyComponent) {
    return (
      <ScrollView contentContainerStyle={contentContainerStyle}>
        {ListHeaderComponent && (
          <View>
            {React.isValidElement(ListHeaderComponent)
              ? ListHeaderComponent
              : React.createElement(ListHeaderComponent as React.ComponentType)}
          </View>
        )}
        {React.isValidElement(ListEmptyComponent)
          ? ListEmptyComponent
          : React.createElement(ListEmptyComponent as React.ComponentType)}
        {ListFooterComponent && (
          <View>
            {React.isValidElement(ListFooterComponent)
              ? ListFooterComponent
              : React.createElement(ListFooterComponent as React.ComponentType)}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={contentContainerStyle}>
      {ListHeaderComponent && (
        <View>
          {React.isValidElement(ListHeaderComponent)
            ? ListHeaderComponent
            : React.createElement(ListHeaderComponent as React.ComponentType)}
        </View>
      )}
      {/* @ts-ignore - CSS grid is valid on web via react-native-web */}
      <View style={gridStyle}>
        {data.map((item, index) => (
          <View key={keyExtractor(item, index)}>
            {renderItem({ item, index, separators: { highlight: () => {}, unhighlight: () => {}, updateProps: () => {} } })}
          </View>
        ))}
      </View>
      {ListFooterComponent && (
        <View>
          {React.isValidElement(ListFooterComponent)
            ? ListFooterComponent
            : React.createElement(ListFooterComponent as React.ComponentType)}
        </View>
      )}
    </ScrollView>
  );
}
