type PendingRegistration = {
  email: string;
  password: string;
};

let pendingRegistration: PendingRegistration | null = null;

export function setPendingRegistration(value: PendingRegistration) {
  pendingRegistration = value;
}

export function getPendingRegistration() {
  return pendingRegistration;
}

export function clearPendingRegistration() {
  pendingRegistration = null;
}
