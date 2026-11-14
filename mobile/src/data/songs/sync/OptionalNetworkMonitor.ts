export type OptionalNetworkState = {
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

export type OptionalNetworkNativeModule = {
  getNetworkStateAsync(): Promise<OptionalNetworkState>;
  addListener(
    eventName: "onNetworkStateChanged",
    listener: (state: OptionalNetworkState) => void,
  ): { remove(): void };
};

export type OptionalNetworkMonitor = {
  refresh(): Promise<boolean>;
  remove(): void;
};

export function attachOptionalNetworkMonitor(
  loadModule: () => OptionalNetworkNativeModule | null,
  onState: (state: OptionalNetworkState) => void,
): OptionalNetworkMonitor {
  let module: OptionalNetworkNativeModule | null = null;
  try {
    module = loadModule();
  } catch {
    return { refresh: async () => false, remove: () => undefined };
  }
  if (!module) return { refresh: async () => false, remove: () => undefined };

  const refresh = async () => {
    try {
      onState(await module.getNetworkStateAsync());
      return true;
    } catch {
      return false;
    }
  };

  void refresh();
  let subscription: { remove(): void } | null = null;
  try {
    subscription = module.addListener("onNetworkStateChanged", onState);
  } catch {
    subscription = null;
  }
  return {
    refresh,
    remove: () => subscription?.remove(),
  };
}
