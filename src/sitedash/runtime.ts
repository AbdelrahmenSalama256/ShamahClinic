import { buildRuntime } from "./host-runtime";
import { snapshot } from "./snapshot";

export const { sd, SDSection } = buildRuntime(snapshot);
