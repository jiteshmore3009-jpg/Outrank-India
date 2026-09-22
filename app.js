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

const CATEGORIES = [
  "Technology",
  "FMCG",
  "Real Estate",
  "Food & Beverage",
  "Fintech",
  "D2C / Consumer Brands",
  "Media & Entertainment",
  "Healthcare",
  "Automotive",
  "Education",
  "Other",
];

const isCategoryPage = document.body.dataset.page === "category";

let listings = [];
let activeListingId = null;
let toastTimer = 0;
let supabaseClient = null;

function pageCategory() {
  const raw = new URLSearchParams(window.location.search).get("category") || "";
  const decoded = raw.trim();
  return CATEGORIES.find((item) => item.toLowerCase() === decoded.toLowerCase()) || "";
}

function applyCategoryHeading() {
  const category = pageCategory();
  const title = document.querySelector("#category-title");
  if (!title) return;
  const heading = category ? `Top ${category} Companies in India` : "Top Companies in India";
  title.textContent = heading;
  document.title = `${heading} — Outrank India`;
}

function markActiveCategoryLinks() {
  const current = pageCategory();
  document.querySelectorAll(".category-nav a").forEach((link) => {
    const value = new URL(link.href, window.location.href).searchParams.get("category") || "";
    link.classList.toggle("is-current", Boolean(current) && value === current);
  });
}

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
    category: String(item.category || "").trim(),
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
  if (!rankToast) return;
  rankToast.hidden = false;
  rankToast.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    rankToast.hidden = true;
  }, 3500);
}

function setFormStatus(message) {
  if (!formStatus) return;
  if (!message) {
    formStatus.hidden = true;
    formStatus.textContent = "";
    return;
  }
  formStatus.hidden = false;
  formStatus.textContent = message;
}

function currentTopBid() {
  sortListings();
  return listings[0] ? listings[0].bid : 0;
}

function claimFields() {
  const valueOf = (name) => String(joinForm.querySelector(`[name="${name}"]`)?.value || "").trim();
  return {
    name: valueOf("name"),
    url: valueOf("url"),
    description: valueOf("description"),
    bid: Math.floor(Number(valueOf("bid"))),
    category: valueOf("category"),
  };
}

function selectedCategory() {
  const category = claimFields().category;
  return CATEGORIES.includes(category) ? category : "";
}

function showClaimStep(step) {
  joinForm.querySelectorAll(".claim-step").forEach((panel) => {
    panel.hidden = panel.dataset.step !== step;
  });
  joinForm.querySelectorAll(".claim-progress li").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.step === step || (step === "payment" && item.dataset.step === "review"));
  });
  setFormStatus("");
}

function refreshBidGuidance() {
  const topBid = currentTopBid();
  const leader = document.querySelector("#claim-leader");
  const status = document.querySelector("#claim-bid-status");
  const bidInput = joinForm.querySelector('input[name="bid"]');
  const bid = Math.floor(Number(bidInput.value));

  leader.textContent = `Current #1 bid: ${rupee.format(topBid || 0)}`;

  if (!bidInput.value) {
    status.textContent = "";
    status.className = "claim-bid-status";
    return false;
  }

  if (!Number.isFinite(bid) || bid <= topBid) {
    status.textContent = "Your bid must be higher than the current #1 bid.";
    status.className = "claim-bid-status is-error";
    return false;
  }

  status.textContent = "You would currently rank #1.";
  status.className = "claim-bid-status is-ok";
  return true;
}

function fillReview() {
  const draft = claimFields();
  document.querySelector("#review-rank").textContent = "#1";
  document.querySelector("#review-bid").textContent = rupee.format(draft.bid);
  document.querySelector("#review-category").textContent = selectedCategory();
  document.querySelector("#review-listing").textContent = draft.name;
}

function openJoinForm() {
  joinForm.hidden = false;
  openFormButton.hidden = true;
  showClaimStep("details");
  refreshBidGuidance();
  document.querySelector("#join").scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => joinForm.querySelector("input").focus(), 250);
}

function renderEmptyState() {
  const empty = document.querySelector("#category-empty");
  if (!empty || !board) return;
  const isEmpty = listings.length === 0;
  empty.hidden = !isEmpty;
  board.hidden = isEmpty;
}

function renderBoard(highlightId) {
  if (!board) return;
  sortListings();
  const header = board.querySelector(".board-row-head");
  board.replaceChildren(header);
  renderEmptyState();

  listings.forEach((listing, index) => {
    const rank = index + 1;
    const href = safeUrl(listing.url);
    const title = href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(listing.name)}</a>`
      : escapeHtml(listing.name);
    let websiteLabel = "";
    if (href) {
      try {
        websiteLabel = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        websiteLabel = href;
      }
    }
    const website = href
      ? `<a class="listing-site" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteLabel)}</a>`
      : "";
    const row = document.createElement("article");
    row.className = `board-row${highlightId === listing.id ? " is-updated" : ""}`;
    row.dataset.id = listing.id;
    row.setAttribute("role", "listitem");
    row.innerHTML = `
      <span class="rank-num ${rank <= 3 ? "top" : ""}">#${rank}</span>
      <div class="listing">
        <h3>${title}${listing.category ? ` <span class="listing-category">${escapeHtml(listing.category)}</span>` : ""}</h3>
        ${website}
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
  let query = supabaseClient
    .from(tableName)
    .select("id, created_at, name, website_url, description, bid_amount, category")
    .order("bid_amount", { ascending: false });

  if (isCategoryPage) {
    const category = pageCategory();
    if (!category) {
      listings = [];
      renderBoard();
      return;
    }
    query = query.ilike("category", category);
  }

  const { data, error } = await query;

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

board?.addEventListener("click", (event) => {
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

if (joinForm) {
  closeFormButton.addEventListener("click", () => {
    joinForm.hidden = true;
    openFormButton.hidden = false;
    showClaimStep("details");
    setFormStatus("");
  });

  joinForm.querySelector('input[name="bid"]').addEventListener("input", refreshBidGuidance);

  document.querySelector("#claim-to-category").addEventListener("click", () => {
    const draft = claimFields();
    const href = safeUrl(draft.url);
    if (!draft.name || !href || !draft.description) {
      setFormStatus("Enter a name, valid website URL, and short description.");
      return;
    }
    joinForm.querySelector('input[name="url"]').value = href;
    showClaimStep("category");
    joinForm.querySelector('select[name="category"]').focus();
  });

  document.querySelector("#claim-back-details").addEventListener("click", () => {
    showClaimStep("details");
    joinForm.querySelector('input[name="name"]').focus();
  });

  document.querySelector("#claim-to-bid").addEventListener("click", () => {
    if (!selectedCategory()) {
      setFormStatus("Choose a category to continue.");
      return;
    }
    showClaimStep("bid");
    refreshBidGuidance();
    joinForm.querySelector('input[name="bid"]').focus();
  });

  document.querySelector("#claim-back-category").addEventListener("click", () => {
    showClaimStep("category");
    joinForm.querySelector('select[name="category"]').focus();
  });

  document.querySelector("#claim-to-review").addEventListener("click", () => {
    if (!selectedCategory()) {
      showClaimStep("category");
      setFormStatus("Choose a category to continue.");
      return;
    }
    if (!refreshBidGuidance()) {
      setFormStatus("Your bid must be higher than the current #1 bid.");
      return;
    }
    fillReview();
    showClaimStep("review");
  });

  document.querySelector("#claim-back-bid").addEventListener("click", () => {
    showClaimStep("bid");
    joinForm.querySelector('input[name="bid"]').focus();
  });

  document.querySelector("#claim-to-payment").addEventListener("click", () => {
    if (!selectedCategory()) {
      showClaimStep("category");
      setFormStatus("Choose a category to continue.");
      return;
    }
    if (!refreshBidGuidance()) {
      showClaimStep("bid");
      setFormStatus("Your bid must be higher than the current #1 bid.");
      return;
    }
    showClaimStep("payment");
  });

  document.querySelector("#claim-edit-bid").addEventListener("click", () => {
    showClaimStep("bid");
    joinForm.querySelector('input[name="bid"]').focus();
  });

  document.querySelector("#claim-back-review").addEventListener("click", () => {
    showClaimStep("review");
  });
}

async function start() {
  if (isCategoryPage) {
    applyCategoryHeading();
    markActiveCategoryLinks();
  }

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

  if (joinForm && window.location.hash === "#join") {
    openJoinForm();
  }
}

start();
