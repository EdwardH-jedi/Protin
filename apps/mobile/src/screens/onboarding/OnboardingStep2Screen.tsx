import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Screen } from '../../components/Screen';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep2'>;

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 4;
const BIO_MAX = 400;

export function OnboardingStep2Screen({ navigation }: Props) {
  const { profile, photoUris, uploadProfilePhotos, upsertProfile } = useProfileStore();
  // Hard-clamp hydrated state to MAX_PHOTOS so an over-long persisted/preloaded
  // list cannot silently survive into the screen's working copy.
  const [photos, setPhotos] = useState<string[]>(() => photoUris.slice(0, MAX_PHOTOS));
  const [bio, setBio] = useState<string>(profile?.bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function pickPhoto() {
    setError(null);
    if (photos.length >= MAX_PHOTOS) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo library access needed',
        'Protin needs permission to your photo library so you can add profile photos.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, uri]));
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleContinue() {
    setError(null);
    if (photos.length < MIN_PHOTOS) {
      setError(`Please add at least ${MIN_PHOTOS} photos.`);
      return;
    }
    if (photos.length > MAX_PHOTOS) {
      // Defence-in-depth against malformed hydrated state: the picker already
      // refuses to add past MAX_PHOTOS, but submit must also reject it rather
      // than silently persisting an over-long list downstream.
      setError(`You can only keep up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const trimmedBio = bio.trim();
    if (!trimmedBio) {
      setError('Please write a short bio.');
      return;
    }
    if (!profile || !profile.displayName) {
      // Profile must be present from Step 1 — the backend requires
      // display_name on every profile PUT, so we cannot send bio alone.
      setError('Your basic info is missing. Please restart onboarding.');
      return;
    }
    setIsSubmitting(true);
    try {
      // Upload photos first: avatar_url on the profile is synced server-side
      // to the first photo, so persisting bio afterwards keeps the latest
      // updated_at while preserving the server-assigned avatar.
      await uploadProfilePhotos(photos);
      await upsertProfile({
        displayName: profile.displayName,
        birthYear: profile.birthYear,
        suburb: profile.suburb,
        bio: trimmedBio,
      });
      navigation.navigate('OnboardingStep3');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your photos and bio. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null);

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.progress}>
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
        <Text style={styles.stepLabel}>Step 2 of 4</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Profile</Text>
        <Text style={styles.title}>Photos & bio</Text>
        <Text style={styles.subtitle}>
          Add {MIN_PHOTOS}–{MAX_PHOTOS} photos and a short bio so partners know who they'll train with.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Photos<Text style={styles.required}> *</Text>
        </Text>
        <Text style={styles.hint}>
          {photos.length} of {MAX_PHOTOS} selected · at least {MIN_PHOTOS} required
        </Text>
        <View style={styles.photoGrid}>
          {slots.map((uri, index) => (
            <PhotoSlot
              key={`slot-${index}`}
              uri={uri}
              index={index}
              canAdd={index === photos.length && photos.length < MAX_PHOTOS}
              onAdd={pickPhoto}
              onRemove={() => removePhoto(index)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Bio<Text style={styles.required}> *</Text>
        </Text>
        <TextInput
          style={styles.bioInput}
          value={bio}
          onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
          placeholder="Tell partners a bit about yourself and how you train..."
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          accessibilityLabel="Bio"
        />
        <Text style={styles.charCount}>{bio.length} / {BIO_MAX}</Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          (pressed || isSubmitting) && styles.submitPressed,
        ]}
        onPress={handleContinue}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Continue"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.submitText}>Continue</Text>
        )}
      </Pressable>
    </Screen>
  );
}

interface PhotoSlotProps {
  uri: string | null;
  index: number;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

function PhotoSlot({ uri, index, canAdd, onAdd, onRemove }: PhotoSlotProps) {
  if (uri) {
    return (
      <View style={styles.slot}>
        <Image source={{ uri }} style={styles.slotImage} resizeMode="cover" />
        <Pressable
          style={styles.removeButton}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove photo ${index + 1}`}
        >
          <Text style={styles.removeButtonText}>×</Text>
        </Pressable>
      </View>
    );
  }
  if (canAdd) {
    return (
      <Pressable
        style={({ pressed }) => [styles.slot, styles.slotAdd, pressed && styles.slotPressed]}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={`Add photo ${index + 1}`}
      >
        <Text style={styles.slotAddPlus}>+</Text>
        <Text style={styles.slotAddLabel}>Add photo</Text>
      </Pressable>
    );
  }
  return <View style={[styles.slot, styles.slotEmpty]} />;
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 20,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
  },
  header: {
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slot: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotAdd: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPressed: {
    opacity: 0.65,
  },
  slotEmpty: {
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    opacity: 0.4,
  },
  slotAddPlus: {
    ...typography.h1,
    color: colors.textTertiary,
  },
  slotAddLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: colors.textInverse,
    fontSize: 20,
    lineHeight: 22,
  },
  bioInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 120,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  charCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  submit: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: spacing.xl,
  },
  submitPressed: {
    opacity: 0.65,
  },
  submitText: {
    ...typography.button,
    color: colors.textInverse,
  },
});
