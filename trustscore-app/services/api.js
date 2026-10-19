// API requests to backend

import AsyncStorage from "@react-native-async-storage/async-storage";
const API_URL = "http://10.0.2.2:8000";

// Helper functions

async function saveSession(data) {
  if (data.access_token) {
    await AsyncStorage.setItem("access_token", data.access_token);
  }

  if (data.refresh_token) {
    await AsyncStorage.setItem("refresh_token", data.refresh_token);
  }

  if (data.user_id) {
    await AsyncStorage.setItem("user_id", data.user_id);
  }
}


async function clearSession() {
  await AsyncStorage.removeItem("access_token");
  await AsyncStorage.removeItem("refresh_token");
  await AsyncStorage.removeItem("user_id");
}


async function readResponseData(response) {
  try {
    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    const text = await response.text();
    return { detail: text || "Unexpected server response" };
  } catch {
    return { detail: "Unable to read server response" };
  }
}


async function refreshAccessToken() {
  const refreshToken = await AsyncStorage.getItem("refresh_token");

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await readResponseData(response);

    if (!response.ok || !data.access_token) {
      await clearSession();
      return false;
    }

    await saveSession(data);
    return true;
  } catch {
    await clearSession();
    return false;
  }
}


// Make authenticated request and refresh token once if needed
async function request(endpoint, options = {}, canRetry = true) {
  const token = await AsyncStorage.getItem("access_token");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await readResponseData(response);

  if (response.status === 401) {
    const isAuthEndpoint =
      endpoint === "/auth/login" ||
      endpoint === "/auth/register" ||
      endpoint === "/auth/refresh";

    if (isAuthEndpoint) {
      await clearSession();

      if (endpoint === "/auth/login") {
        throw new Error("Invalid email or password. Please create an account if you do not have one.");
      }

      throw new Error(data.detail || "Authentication failed.");
    }

    if (canRetry) {
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        return await request(endpoint, options, false);
      }
    }

    await clearSession();
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    throw new Error(data.detail || "Something went wrong");
  }

  return data;
}


// Authentication
export async function register(email, password, name, age) {
  const parsedAge = parseInt(age, 10);

  const data = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      name,
      age: parsedAge,
    }),
  });

  await saveSession(data);

  return data;
}


export async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  await saveSession(data);

  return data;
}


export async function getProfile() {
  return await request("/auth/profile");
}


export async function updateProfile(profileData) {
  return await request("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(profileData),
  });
}


export async function logout() {
  await clearSession();
}


export async function getToken() {
  return await AsyncStorage.getItem("access_token");
}


// Transactions
export async function createTransaction(transaction) {
  // Remove empty optional fields so backend uses defaults
  const data = { ...transaction };
  if (!data.date || data.date.trim() === "") {
    delete data.date;
  }
  if (!data.name || data.name.trim() === "") {
    data.name = data.category;
  }
  return await request("/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}


export async function deleteTransaction(transactionId) {
  return await request(`/transactions/${transactionId}`, {
    method: "DELETE",
  });
}


export async function getTrackerOverview(month, year) {
  return await request(`/tracker/overview?month=${month}&year=${year}`);
}


// Bills
export async function createBill(bill) {
  return await request("/bills", {
    method: "POST",
    body: JSON.stringify(bill),
  });
}


export async function updateBill(billId, status) {
  return await request(`/bills/${billId}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}


export async function stopTrackingBill(billId) {
  return await request(`/bills/${billId}`, {
    method: "DELETE",
  });
}


export async function deleteBillHistory(billId) {
  return await request(`/bills/${billId}/history`, {
    method: "DELETE",
  });
}


// Trust Score
export async function getScore() {
  return await request("/score");
}


export async function getScoreHistory(limit = 12) {
  return await request(`/score/history?limit=${limit}`);
}

// Behavioural insights
export async function getInsights() {
  return await request("/insights");
}


// Generate natural-language advice 
export async function getInsightAdvice() {
  return await request("/insights/advice", {
    method: "POST",
  });
}


// Simulator
export async function getSimulationSetup() {
  return await request("/simulate/setup");
}


export async function runSimulation(simulatedValues) {
  return await request("/simulate", {
    method: "POST",
    body: JSON.stringify(simulatedValues),
  });
}
