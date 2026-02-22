export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export class UserService {
  private users: Map<string, string> = new Map();

  addUser(id: string, name: string): void {
    this.users.set(id, name);
  }

  getUser(id: string): string | undefined {
    return this.users.get(id);
  }
}

export const DEFAULT_TIMEOUT = 5000;

export enum Status {
  Active = "active",
  Inactive = "inactive",
}

function _internalHelper(): void {
  // not exported
}
