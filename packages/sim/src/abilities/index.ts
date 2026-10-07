import { dash } from "./dash";
import { powerShot } from "./powerShot";
import { registerAbility } from "./registry";
import { shield } from "./shield";

registerAbility(dash);
registerAbility(powerShot);
registerAbility(shield);

export { getAbility, hasAbility, listAbilities, registerAbility } from "./registry";
export type { AbilityContext, AbilityDefinition } from "./types";
