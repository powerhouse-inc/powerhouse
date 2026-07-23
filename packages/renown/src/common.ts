import {
  CREDENTIAL_TYPES,
  DEFAULT_RENOWN_NETWORK_ID,
  DEFAULT_RENOWN_URL,
} from "./constants.js";
import {
  buildAndSignCredential,
  verifyCredentialSignature,
} from "./credential.js";
import { RenownCryptoSigner, type IRenownCrypto } from "./crypto/index.js";
import { MemoryStorage } from "./storage/common.js";
import type { SwitchboardClient } from "./switchboard.js";
import type {
  CreateBearerTokenOptions,
  IProof,
  IRenown,
  ISigner,
  LoginStatus,
  PKHDid,
  PowerhouseVerifiableCredential,
  ProfileFetcher,
  RenownEventEmitter,
  RenownEvents,
  RenownStorage,
  RenownStorageMap,
  SignInParams,
  User,
} from "./types.js";
import { parsePkhDid, verifyAuthBearerToken } from "./utils.js";
export * from "./constants.js";

export class RenownMemoryStorage extends MemoryStorage<RenownStorageMap> {}

export class Renown implements IRenown {
  #baseUrl: string;
  #store: RenownStorage;
  #eventEmitter: RenownEventEmitter;
  #appName: string;
  #crypto: IRenownCrypto;
  #signer: ISigner;
  #profileFetcher?: ProfileFetcher;
  #switchboard?: SwitchboardClient;
  #status: LoginStatus = "initial";

  constructor(
    store: RenownStorage,
    eventEmitter: RenownEventEmitter,
    crypto: IRenownCrypto,
    appName: string,
    baseUrl = DEFAULT_RENOWN_URL,
    profileFetcher?: ProfileFetcher,
    switchboard?: SwitchboardClient,
  ) {
    this.#store = store;
    this.#eventEmitter = eventEmitter;
    this.#baseUrl = baseUrl;
    this.#crypto = crypto;
    this.#appName = appName;
    this.#profileFetcher = profileFetcher;
    this.#switchboard = switchboard;
    this.#signer = new RenownCryptoSigner(crypto, this.#appName, this.user);

    this.on("user", (user) => {
      this.#signer.user = user;
    });
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  get user() {
    return this.#store.get("user");
  }

  get status() {
    return this.#status;
  }

  get signer() {
    return this.#signer;
  }

  get crypto() {
    return this.#crypto;
  }

  get did() {
    return this.#crypto.did;
  }

  get profileFetcher() {
    return this.#profileFetcher;
  }

  #updateStatus(status: LoginStatus) {
    this.#status = status;
    this.#eventEmitter.emit("status", status);
  }

  #updateUser(user: User | undefined) {
    if (user) {
      this.#store.set("user", user);
    } else {
      this.#store.delete("user");
    }
    this.#eventEmitter.emit("user", user);
  }

  async login(userDid: string): Promise<User> {
    this.#updateStatus("checking");
    try {
      const result = parsePkhDid(userDid);
      const credential = await this.#getCredential(
        result.address,
        result.chainId,
        this.#crypto.did,
      );

      if (!credential) {
        this.#updateUser(undefined);
        throw new Error("Credential not found");
      }

      return await this.#completeLogin(userDid, result, credential);
    } catch (error) {
      this.#updateUser(undefined);
      this.#updateStatus("not-authorized");
      throw error;
    }
  }

  // Sign in without the Renown redirect: build + sign a delegation credential
  // with the caller's wallet signer, write it to the switchboard, then log in.
  async signIn(params: SignInParams): Promise<User> {
    if (!this.#switchboard) {
      throw new Error(
        "signIn requires a switchboard endpoint. Set switchboardUrl or a discoverable baseUrl.",
      );
    }
    const {
      address,
      chainId,
      signTypedData,
      username,
      userImage,
      expiresInDays,
    } = params;

    this.#updateStatus("checking");
    try {
      const credential = await buildAndSignCredential({
        signTypedData,
        address,
        chainId,
        app: this.#appName,
        appId: this.did,
        expiresInDays,
      });

      await this.#switchboard.issueCredential(credential);
      await this.#switchboard.findOrCreateUser(address, {
        username,
        userImage,
      });

      const userDid = `did:pkh:${DEFAULT_RENOWN_NETWORK_ID}:${chainId}:${address.toLowerCase()}`;
      // Authenticate from the freshly signed credential — no read-back, which
      // avoids racing the read-model processor that indexes the write.
      return await this.#completeLogin(
        userDid,
        parsePkhDid(userDid),
        credential,
      );
    } catch (error) {
      this.#updateUser(undefined);
      this.#updateStatus("not-authorized");
      throw error;
    }
  }

  // Verify a credential binds to userDid + this app key, set the user, and
  // start the background profile fetch. Throws if the credential is invalid.
  async #completeLogin(
    userDid: string,
    result: PKHDid,
    credential: PowerhouseVerifiableCredential,
  ): Promise<User> {
    if (
      !(
        credential.issuer.id === userDid &&
        credential.credentialSubject.id === this.did
      )
    ) {
      throw new Error("Invalid credential");
    }

    // The API may return proof.eip712 without domain/types; the domain is
    // canonical (version "1", the chainId), so reconstruct it before verifying.
    const eip712 = credential.proof.eip712 as
      | Partial<IProof["eip712"]>
      | undefined;
    const verifiableCredential: PowerhouseVerifiableCredential = eip712?.domain
      ? credential
      : {
          ...credential,
          proof: {
            ...credential.proof,
            eip712: {
              domain: { version: "1", chainId: result.chainId },
              types: CREDENTIAL_TYPES,
              primaryType: "VerifiableCredential",
            },
          },
        };

    // Verify the EIP-712 proof was signed by the DID's address on its chain.
    if (
      credential.issuer.ethereumAddress.toLowerCase() !==
        result.address.toLowerCase() ||
      verifiableCredential.proof.eip712.domain.chainId !== result.chainId ||
      !(await verifyCredentialSignature(verifiableCredential))
    ) {
      throw new Error("Invalid credential signature");
    }

    const user: User = {
      ...result,
      address: credential.issuer.ethereumAddress,
      did: userDid,
      credential: verifiableCredential,
    };

    this.#updateUser(user);
    this.#updateStatus("authorized");

    // Fetch profile data in the background if a fetcher is configured
    if (this.#profileFetcher) {
      this.#profileFetcher(user, this.#baseUrl)
        .then((profile) => {
          if (
            profile &&
            this.user?.address === user.address &&
            this.user.chainId === user.chainId
          ) {
            this.#updateUser({
              ...this.user,
              profile,
              ens: {
                name: profile.username ?? undefined,
                avatarUrl: profile.userImage ?? undefined,
              },
            });
          }
        })
        .catch(console.error);
    }

    return user;
  }

  logout() {
    this.#updateUser(undefined);
    this.#updateStatus("initial");
    return Promise.resolve();
  }

  // Re-check the current user's credential at the source; logs out if it was
  // revoked or expired. Network errors keep the session (fail open).
  async revalidate(): Promise<boolean> {
    const user = this.user;
    if (!user) return false;
    try {
      const credential = await this.#getCredential(
        user.address,
        user.chainId,
        this.#crypto.did,
      );
      if (!credential) {
        await this.logout();
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  on<K extends keyof RenownEvents>(
    event: K,
    listener: (data: RenownEvents[K]) => void,
  ): () => void {
    return this.#eventEmitter.on(event, listener);
  }

  async #getCredential(
    address: string,
    chainId: number,
    appDid: string,
  ): Promise<PowerhouseVerifiableCredential | undefined> {
    // Direct-switchboard flow: read the credential from the reactor subgraph.
    if (this.#switchboard) {
      return this.#switchboard.getCredential({ address, chainId, appDid });
    }
    if (!this.#baseUrl) {
      throw new Error("RENOWN_URL is not set");
    }
    const url = new URL(
      `/api/auth/credential?address=${encodeURIComponent(address)}&chainId=${encodeURIComponent(chainId)}&connectId=${encodeURIComponent(appDid)}&appId=${encodeURIComponent(appDid)}`,
      this.#baseUrl,
    );
    const response = await fetch(url, {
      method: "GET",
    });
    if (response.ok) {
      const result = (await response.json()) as {
        credential: PowerhouseVerifiableCredential;
      };
      return result.credential;
    } else {
      throw new Error(`Failed to get credential: ${response.status}`);
    }
  }

  async verifyBearerToken(token: string) {
    return verifyAuthBearerToken(token);
  }

  async getBearerToken(options: CreateBearerTokenOptions) {
    if (!this.user) {
      throw new Error("User not found");
    }
    return this.#crypto.getBearerToken(this.user.address, options);
  }
}
