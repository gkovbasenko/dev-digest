import { describeSkill, runSkillCases } from "../../src/index.js";
import { cases } from "./server-architecture.cases.js";

describeSkill("server-architecture", () => runSkillCases("server-architecture", cases));
