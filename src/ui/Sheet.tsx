import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from './theme';
import { Txt } from './Txt';

const DURATION = 220;

// Bottom sheet: slides up over a dimmed screen; tapping the dim area closes it, and so does Android back unless
// onBack is given.
export const Sheet = ({
  visible,
  onClose,
  onBack,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Android back, when it should step back inside the sheet instead of closing it. */
  onBack?: () => void;
  title?: string;
  children: ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(progress, { toValue: visible ? 1 : 0, duration: DURATION, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !visible) setMounted(false);
      },
    );
  }, [visible, progress]);

  if (!mounted) return null;

  const height = Dimensions.get('window').height;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onBack ?? onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space.l) + space.s, transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          {!!title && (
            <Txt variant="title" style={styles.title} accessibilityRole="header">
              {title}
            </Txt>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    maxHeight: '90%',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: space.m },
  title: { marginBottom: space.m },
});
