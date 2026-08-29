import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';

export interface SearchBarProps {
  placeholder: string;
  onSearch: (query: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ placeholder, onSearch }) => {
  const [text, setText] = useState('');

  const handleChangeText = (value: string) => {
    setText(value);
    onSearch(value);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#999"
        value={text}
        onChangeText={handleChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        accessibilityRole="search"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
});
