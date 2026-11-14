import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { useSongSyncConflicts } from "../data/songs";
import type { SongSyncDeletionConflict } from "../data/songs/sync/types";
import { SongSyncConflictNoticeGuard } from "../data/songs/sync/SongSyncConflictNoticeGuard";

export function SongSyncConflictNotices({
  onResolved,
  refreshKey,
}: {
  onResolved: () => void | Promise<void>;
  refreshKey: number;
}) {
  const { user } = useAuth();
  const controller = useSongSyncConflicts();
  const noticeGuardRef = useRef(new SongSyncConflictNoticeGuard());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showNext = useCallback(async () => {
    if (!user || !noticeGuardRef.current.beginCheck()) return;
    const [conflict] = await controller.list(user.id).catch(() => []);
    if (!mountedRef.current) {
      noticeGuardRef.current.finishCheck(null);
      return;
    }
    if (!noticeGuardRef.current.finishCheck(conflict?.id ?? null) || !conflict) return;

    const finish = async (action: () => Promise<void>) => {
      if (!noticeGuardRef.current.beginResolution(conflict.id)) return;
      try {
        await action();
      } catch {
        noticeGuardRef.current.finishResolution(conflict.id);
        Alert.alert("No pudimos resolverlo", "Tus datos siguen guardados. Probá de nuevo más tarde.");
        return;
      }
      noticeGuardRef.current.finishResolution(conflict.id);
      await Promise.resolve(onResolved()).catch(() => undefined);
    };

    if (conflict.kind === "remote_deletion") {
      Alert.alert(
        "Esta canción ya fue eliminada desde otro dispositivo",
        "Los cambios realizados aquí no se sincronizarán.",
        [{
          text: "Entendido",
          onPress: () => void finish(() => controller.acknowledgeRemoteDeletion(user.id, conflict.id)),
        }],
        { cancelable: false },
      );
      return;
    }

    showLocalDeletionDecision(conflict, {
      keep: () => void finish(() => controller.keepRemote(user.id, conflict.id)),
      remove: () => void finish(() => controller.deleteAnyway(user.id, conflict.id)),
    });
  }, [controller, onResolved, user]);

  useFocusEffect(useCallback(() => {
    void showNext();
    return undefined;
  }, [showNext]));

  useEffect(() => {
    void showNext();
  }, [refreshKey, showNext]);

  return null;
}

function showLocalDeletionDecision(
  conflict: SongSyncDeletionConflict,
  actions: { keep: () => void; remove: () => void },
) {
  const isGroup = conflict.remoteSongs.length > 1;
  Alert.alert(
    "Esta canción cambió en otro dispositivo",
    isGroup
      ? "La canción o alguna de sus versiones cambió antes de completar la eliminación."
      : "La canción cambió antes de completar la eliminación.",
    [
      { text: "Conservar canción", onPress: actions.keep },
      { text: "Eliminar de todos modos", style: "destructive", onPress: actions.remove },
    ],
    { cancelable: false },
  );
}
