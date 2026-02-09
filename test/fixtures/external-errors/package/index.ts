import { getValue } from "../external-dep";

export function greet(name: string): string {
  return `${getValue()} ${name}`;
}
