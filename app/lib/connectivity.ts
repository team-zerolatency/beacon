import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

export type InternetState = {
  isConnected: boolean;
  isInternetReachable: boolean;
  hasInternet: boolean;
  type: NetInfoState["type"];
};

function normalize(state: NetInfoState): InternetState {
  const isConnected = Boolean(state.isConnected);
  const isInternetReachable = Boolean(state.isInternetReachable);

  return {
    isConnected,
    isInternetReachable,
    hasInternet: isConnected && isInternetReachable,
    type: state.type,
  };
}

export async function getInternetState(): Promise<InternetState> {
  const state = await NetInfo.fetch();
  return normalize(state);
}

export function subscribeInternetState(
  callback: (state: InternetState) => void,
): () => void {
  return NetInfo.addEventListener((state) => {
    callback(normalize(state));
  });
}
