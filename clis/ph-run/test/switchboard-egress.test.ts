import { describe, expect, it } from "vitest";
import { allowLocalhostEgress } from "../src/services/switchboard.js";

const ENV = "PH_WORKFLOWS_EGRESS_ALLOW_ADDRESSES";

describe("allowLocalhostEgress", () => {
  it("allows localhost when nothing is set", () => {
    const env: NodeJS.ProcessEnv = {};
    allowLocalhostEgress(env);
    expect(env[ENV]).toBe("127.0.0.1/32,::1/128");
  });

  it("keeps addresses already allowed", () => {
    const env: NodeJS.ProcessEnv = { [ENV]: "10.0.0.5, 192.168.1.0/24" };
    allowLocalhostEgress(env);
    expect(env[ENV]).toBe("10.0.0.5,192.168.1.0/24,127.0.0.1/32,::1/128");
  });

  it("leaves the value alone when localhost is already allowed", () => {
    const env: NodeJS.ProcessEnv = { [ENV]: "::1/128,127.0.0.1/32" };
    allowLocalhostEgress(env);
    expect(env[ENV]).toBe("::1/128,127.0.0.1/32");
  });
});
