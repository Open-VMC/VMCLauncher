import type { AccountSummary, AuthPayload, CreateServerPayload } from "../../shared/contracts";

const DEFAULT_AUTH_API_BASE_URL = "http://217.182.205.254:25585";

interface AuthApiResponse {
  token: string;
  account: AccountSummary;
}

interface RemoteServerReservation {
  id: string;
}

export class OpenVmcAuthClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? process.env.VMC_AUTH_API_BASE_URL ?? DEFAULT_AUTH_API_BASE_URL).replace(/\/+$/, "");
  }

  async register(payload: AuthPayload, deviceId: string): Promise<AuthApiResponse> {
    return this.request<AuthApiResponse>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        displayName: payload.displayName,
        deviceId,
        deviceName: buildDeviceName(),
      }),
    });
  }

  async login(payload: AuthPayload, deviceId: string): Promise<AuthApiResponse> {
    return this.request<AuthApiResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        deviceId,
        deviceName: buildDeviceName(),
      }),
    });
  }

  async getMe(token: string, deviceId: string): Promise<AccountSummary> {
    return this.request<AccountSummary>("/v1/auth/session", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-OpenVMC-Device-Id": deviceId,
      },
    });
  }

  async logout(token: string, deviceId: string): Promise<void> {
    await this.request<void>("/v1/auth/session", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-OpenVMC-Device-Id": deviceId,
      },
    });
  }

  async createRemoteServer(token: string, deviceId: string, payload: CreateServerPayload, localServerUuid: string): Promise<RemoteServerReservation> {
    return this.request<RemoteServerReservation>("/v1/launcher/servers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-OpenVMC-Device-Id": deviceId,
      },
      body: JSON.stringify({
        localServerUuid,
        displayName: payload.displayName,
        kind: payload.kind,
        version: payload.version,
      }),
    });
  }

  async deleteRemoteServer(token: string, deviceId: string, serverId: string): Promise<void> {
    await this.request<void>(`/v1/launcher/servers/${serverId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-OpenVMC-Device-Id": deviceId,
      },
    });
  }

  async renameRemoteServer(token: string, deviceId: string, serverId: string, newName: string): Promise<void> {
    await this.request<void>(`/v1/launcher/servers/${serverId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-OpenVMC-Device-Id": deviceId,
      },
      body: JSON.stringify({
        displayName: newName,
      }),
    });
  }

  private async request<T>(pathname: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let message = `La requete OpenVMC a echoue (${response.status}).`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) {
          message = payload.message;
        }
      } catch {
        // Ignore invalid JSON body.
      }
      throw new OpenVmcApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

export class OpenVmcApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function buildDeviceName(): string {
  return `${process.platform}-${process.arch}`;
}
