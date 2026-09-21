const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const config = window.OUTRANK_SUPABASE || {};
const tableName = config.table || "Listings";
const board = document.querySelector(".board");
const openFormButtons = document.querySelectorAll(".js-open-join");
const openFormButton = document.querySelector("#open-form");
const closeFormButton = document.querySelector("#close-form");
const joinForm = document.querySelector("#join-form");
const formStatus = document.querySelector("#form-status");
const outbidDialog = document.querySelector("#outbid-dialog");
const outbidForm = document.querySelector("#outbid-form");
const outbidCopy = document.querySelector("#outbid-copy");
const outbidInput = document.querySelector("#outbid-amount");
const outbidError = document.querySelector("#outbid-error");
const outbidSuccess = document.querySelector("#outbid-success");
const outbidCancel = document.querySelector("#outbid-cancel");
const outbidDone = document.querySelector("#outbid-done");
const rankToast = document.querySelector("#rank-toast");

let listings = [];
let activeListingId = null;
let toastTimer = 0;
let supabaseClient = null;

function isConfigured() {
  const url = String(config.url || "");
  const key = String(config.publishableKey || "");
  return (
    url.startsWith("https://") &&
    key.length > 20 &&
    !url.includes("YOUR_PROJECT_ID") &&
    !key.includes("YOUR_SUPABASE_PUBLISHABLE_KEY")
  );
}

function createClient() {
  if (!isConfigured()) return null;
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    return null;
  }
  return window.supabase.createClient(config.url, config.publishableKey);
}

function normalizeListing(item) {
  if (!item || typeof item.name !== "string") return null;
  const bid = Number(item.bid_amount ?? item.bid);
  if (!Number.isFinite(bid) || bid < 1) return null;
  const created = item.created_at || item.createdAt || 0;
  return {
    id: String(item.id || ""),
    name: item.name.trim(),
    url: String(item.website_url || item.url || "").trim(),
    description: String(item.description || "").trim(),
    bid: Math.floor(bid),
    createdAt: typeof created === "string" ? Date.parse(created) || 0 : Number(created) || 0,
  };
}

function sortListings() {
  listings.sort((a, b) => {
    if (b.bid !== a.bid) return b.bid - a.bid;
    return a.createdAt - b.createdAt;
  });
}

function rankOf(id) {
  return listings.findIndex((item) => item.id === id) + 1;
}

function rankMessage(rank) {
  return `You're now #${rank}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function showToast(message) {
  rankToast.hidden = false;
  rankToast.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    rankToast.hidden = true;
  }, 3500);
}

function setFormStatus(message) {
  formStatus.hidden = false;
  formStatus.textContent = message;
}

function openJoinForm() {
  joinForm.hidden = false;
  openFormButton.hidden = true;
  document.querySelector("#join").scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => joinForm.querySelector("input").focus(), 250);
}

function renderBoard(highlightId) {
  sortListings();
  const header = board.querySelector(".board-row-head");
  board.replaceChildren(header);

  listings.forEach((listing, index) => {
    const rank = index + 1;
    const href = safeUrl(listing.url);
    const title = href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(listing.name)}</a>`
      : escapeHtml(listing.name);
    const row = document.createElement("article");
    row.className = `board-row${highlightId === listing.id ? " is-updated" : ""}`;
    row.dataset.id = listing.id;
    row.setAttribute("role", "listitem");
    row.innerHTML = `
      <span class="rank-num ${rank <= 3 ? "top" : ""}">${String(rank).padStart(2, "0")}</span>
      <div class="listing">
        <h3>${title}</h3>
        <p>${escapeHtml(listing.description)}</p>
      </div>
      <div class="bid">
        <small>Current bid</small>
        <strong>${rupee.format(listing.bid)}</strong>
      </div>
      <button class="btn btn-outbid" type="button" data-id="${escapeHtml(listing.id)}">Outbid</button>
    `;
    board.append(row);
  });
}

async function loadListings() {
  const { data, error } = await supabaseClient
    .from(tableName)
    .select("id, created_at, name, website_url, description, bid_amount")
    .order("bid_amount", { ascending: false });

  if (error) throw error;

  listings = (data || []).map(normalizeListing).filter(Boolean);
  sortListings();
  renderBoard();
}

function openOutbid(listing) {
  activeListingId = listing.id;
  outbidError.hidden = true;
  outbidSuccess.hidden = true;
  outbidDone.hidden = true;
  outbidForm.hidden = false;
  outbidCopy.textContent = `Raise the current bid for ${listing.name}. Current bid is ${rupee.format(listing.bid)}.`;
  outbidInput.min = String(listing.bid + 1);
  outbidInput.value = String(listing.bid + 1000);
  outbidDialog.showModal();
  outbidInput.focus();
  outbidInput.select();
}

board.addEventListener("click", (event) => {
  const button = event.target.closest(".btn-outbid");
  if (!button) return;
  const listing = listings.find((item) => item.id === button.dataset.id);
  if (listing) openOutbid(listing);
});

outbidForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const listing = listings.find((item) => item.id === activeListingId);
  if (!listing) return;

  const nextBid = Math.floor(Number(outbidInput.value));
  if (!Number.isFinite(nextBid) || nextBid <= listing.bid) {
    outbidError.hidden = false;
    outbidError.textContent = `Enter a bid higher than ${rupee.format(listing.bid)}.`;
    return;
  }

  const submitButton = outbidForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  outbidError.hidden = true;

  try {
    const listingId = listing.id;
    const listingName = listing.name;
    const { error } = await supabaseClient
      .from(tableName)
      .update({ bid_amount: nextBid })
      .eq("id", listingId);

    if (error) throw error;

    await loadListings();
    const updated = listings.find((item) => item.id === listingId);
    if (!updated || updated.bid !== nextBid) {
      throw new Error("The bid was not saved. Try again, or check the listing update policy in Supabase.");
    }

    const message = rankMessage(rankOf(listingId));
    renderBoard(listingId);
    outbidForm.hidden = true;
    outbidSuccess.hidden = false;
    outbidDone.hidden = false;
    outbidSuccess.textContent = `${message}. ${listingName} is now ${rupee.format(updated.bid)}.`;
    showToast(message);
  } catch (error) {
    outbidError.hidden = false;
    outbidError.textContent = error.message || "Could not save the new bid.";
  } finally {
    submitButton.disabled = false;
  }
});

outbidCancel.addEventListener("click", () => {
  outbidDialog.close();
});

outbidDone.addEventListener("click", () => {
  outbidDialog.close();
});

outbidDialog.addEventListener("close", () => {
  activeListingId = null;
  outbidForm.hidden = false;
  outbidError.hidden = true;
  outbidSuccess.hidden = true;
  outbidDone.hidden = true;
});

openFormButtons.forEach((button) => {
  button.addEventListener("click", openJoinForm);
});

closeFormButton.addEventListener("click", () => {
  joinForm.hidden = true;
  openFormButton.hidden = false;
  formStatus.hidden = true;
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(joinForm);
  const payload = {
    name: String(data.get("name") || "").trim(),
    website_url: String(data.get("url") || "").trim(),
    description: String(data.get("description") || "").trim(),
    bid_amount: Math.floor(Number(data.get("bid"))),
  };

  if (!payload.name || !payload.website_url || !payload.description || payload.bid_amount < 1) {
    setFormStatus("Enter a valid listing and starting bid.");
    return;
  }

  const submitButton = joinForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const { data: row, error } = await supabaseClient
      .from(tableName)
      .insert(payload)
      .select("id, created_at, name, website_url, description, bid_amount")
      .single();

    if (error) throw error;

    const listing = normalizeListing(row);
    if (!listing) throw new Error("The new listing could not be read.");

    listings.push(listing);
    sortListings();
    const rank = rankOf(listing.id);
    renderBoard(listing.id);
    setFormStatus(`${listing.name} is on the board. ${rankMessage(rank)}.`);
    showToast(rankMessage(rank));
    joinForm.reset();
    document.querySelector("#board").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setFormStatus(error.message || "Could not save the listing.");
  } finally {
    submitButton.disabled = false;
  }
});

async function start() {
  supabaseClient = createClient();
  if (!supabaseClient) {
    showToast("Add your Supabase Project URL and publishable key in config.js.");
    renderBoard();
    return;
  }

  try {
    await loadListings();
  } catch (error) {
    showToast(error.message || "Could not load listings from Supabase.");
    renderBoard();
  }
}

start();
