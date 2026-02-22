export interface User {
  id: string;
  name: string;
  status: Status;
}

export type UserId = string;

export type Status = "active" | "inactive";
