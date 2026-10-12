import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { colors, radius, space, type } from './theme';

export const SearchField = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) => (
  <View style={styles.row}>
    <Icon name="search" size={18} color={colors.ink3} />
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.ink3}
      accessibilityLabel={placeholder}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
    />
    {value !== '' && (
      <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => onChange('')}>
        <Icon name="x" size={18} color={colors.ink3} />
      </Pressable>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.m,
    borderRadius: radius.m,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  input: { flex: 1, ...type.body, color: colors.ink, padding: 0 },
});
