import { create } from "zustand";
import { setSessionTokenGetter, setUserIdGetter } from "@workspace/api-client-react";

interface AuthState {
  userId: string | null;
  name: string | null;
  email: string | null;
  userType: string | null;
  sessionToken: string | null;
  setAuth: (data: { userId: string; name: string; email: string; userType: string; sessionToken?: string }) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => {
  const storedUserId       = localStorage.getItem("userId");
  const storedName         = localStorage.getItem("name");
  const storedEmail        = localStorage.getItem("email");
  const storedUserType     = localStorage.getItem("userType");
  const storedSessionToken = localStorage.getItem("sessionToken");

  // Register getters so every API call carries X-Session-Token and X-User-Id
  setSessionTokenGetter(() => localStorage.getItem("sessionToken"));
  setUserIdGetter(() => localStorage.getItem("userId"));

  return {
    userId:       storedUserId,
    name:         storedName,
    email:        storedEmail,
    userType:     storedUserType,
    sessionToken: storedSessionToken,
    setAuth: (data) => {
      localStorage.setItem("userId", data.userId);
      localStorage.setItem("name", data.name);
      localStorage.setItem("email", data.email);
      localStorage.setItem("userType", data.userType);
      localStorage.setItem("sessionToken", data.sessionToken ?? "");
      set({
        userId:       data.userId,
        name:         data.name,
        email:        data.email,
        userType:     data.userType,
        sessionToken: data.sessionToken ?? null,
      });
    },
    logout: () => {
      localStorage.removeItem("userId");
      localStorage.removeItem("name");
      localStorage.removeItem("email");
      localStorage.removeItem("userType");
      localStorage.removeItem("sessionToken");
      set({ userId: null, name: null, email: null, userType: null, sessionToken: null });
    },
  };
});
