export type HelpStatus = "open" | "in_progress" | "resolved" | "cancelled";

export type MapLocationRow = {
  id: string;
  name: string;
  kind: "ngo" | "help_point";
  state: string | null;
  district: string | null;
  city: string | null;
  lat: number;
  lng: number;
  notes: string | null;
  created_at: string;
};

export type NgoDirectoryRow = {
  id: string;
  name: string;
  state: string;
  district: string;
  city: string;
  is_active: boolean;
  created_at: string;
};

export type HelpRequestRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  requester_phone: string | null;
  target_ngo_id: string | null;
  target_ngo_name: string | null;
  target_state: string | null;
  target_district: string | null;
  target_city: string | null;
  detected_state: string | null;
  detected_district: string | null;
  detected_city: string | null;
  detected_location_text: string | null;
  message: string;
  lat: number;
  lng: number;
  status: HelpStatus;
  created_at: string;
  updated_at: string;
};
