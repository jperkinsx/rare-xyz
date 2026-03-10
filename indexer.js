/**
 * Rare Protocol Indexer Client
 * 
 * Shared GraphQL client for the Envio-hosted indexer.
 * Used by profile.html, app.js, and any other page that needs indexed data.
 */

var INDEXER_ENDPOINT = "https://indexer.dev.hyperindex.xyz/d59a89b/v1/graphql";
var IPFS_GATEWAYS = [
  "https://ipfs.pixura.io/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];

// ─── Core GraphQL helper ───────────────────────────────────────────

async function indexerQuery(query, variables) {
  var body = { query: query };
  if (variables) body.variables = variables;

  var res = await fetch(INDEXER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error("Indexer request failed: " + res.status);

  var json = await res.json();
  if (json.errors) {
    console.warn("Indexer GraphQL errors:", json.errors);
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }
  return json.data;
}

// ─── Address Profile ───────────────────────────────────────────────

async function indexerGetAddressProfile(address) {
  var addr = address.toLowerCase();
  var data = await indexerQuery(`
    query AddressProfile($addr: String!) {
      owned: Token(where: { owner: { _eq: $addr } }, order_by: { mintedAt: desc }, limit: 100) {
        id tokenId owner creator tokenURI
        metadataName metadataDescription metadataImage metadataAnimationUrl
        metadataFetched collection_id mintedAt mintTxHash
      }
      created: Token(where: { creator: { _eq: $addr } }, order_by: { mintedAt: desc }, limit: 100) {
        id tokenId owner creator tokenURI
        metadataName metadataDescription metadataImage metadataAnimationUrl
        metadataFetched collection_id mintedAt mintTxHash
      }
      collections: NftCollection(where: { owner: { _eq: $addr } }, order_by: { createdAt: desc }) {
        id name symbol tokenCount createdAt
      }
      listings: Listing(where: { seller: { _eq: $addr }, active: { _eq: true } }) {
        id token_id seller currencyAddress price createdAt
      }
      activity: Activity(where: { _or: [{ from: { _eq: $addr } }, { to: { _eq: $addr } }] }, order_by: { timestamp: desc }, limit: 30) {
        id activityType token_id from to currencyAddress amount timestamp txHash
      }
    }
  `, { addr: addr });
  return data;
}

// ─── Tokens ────────────────────────────────────────────────────────

async function indexerGetTokens(options) {
  var limit = (options && options.limit) || 50;
  var offset = (options && options.offset) || 0;
  var collection = options && options.collection;
  
  var where = collection ? ', where: { collection_id: { _eq: "' + collection.toLowerCase() + '" } }' : "";
  
  var data = await indexerQuery(`{
    Token(limit: ${limit}, offset: ${offset}${where}, order_by: { mintedAt: desc }) {
      id tokenId owner creator tokenURI
      metadataName metadataDescription metadataImage metadataAnimationUrl
      metadataFetched collection_id mintedAt mintTxHash
    }
  }`);
  return data.Token || [];
}

async function indexerGetToken(contractAddress, tokenId) {
  var id = contractAddress.toLowerCase() + "-" + tokenId;
  var data = await indexerQuery(`
    query TokenDetail($id: String!) {
      Token_by_pk(id: $id) {
        id tokenId owner creator tokenURI
        metadataName metadataDescription metadataImage metadataAnimationUrl
        metadataAttributes metadataFetched collection_id mintedAt mintTxHash
      }
      Listing(where: { token_id: { _eq: $id }, active: { _eq: true } }, limit: 1) {
        id seller currencyAddress price
      }
      Offer(where: { token_id: { _eq: $id }, active: { _eq: true } }, order_by: { amount: desc }) {
        id bidder currencyAddress amount convertible
      }
      Auction(where: { token_id: { _eq: $id } }, order_by: { createdAt: desc }, limit: 1) {
        id creator currencyAddress startingTime minimumBid lengthOfAuction endsAt
        auctionType status highestBidder highestBid bidCount settledAmount settledBuyer
        app appFee protocolFee
      }
      Sale(where: { token_id: { _eq: $id } }, order_by: { timestamp: desc }, limit: 10) {
        id buyer seller currencyAddress amount app appFee protocolFee timestamp txHash
      }
    }
  `, { id: id });
  
  var auction = data.Auction && data.Auction[0];
  if (auction) {
    var now = Math.floor(Date.now() / 1000);
    var endsAt = Number(auction.endsAt);
    auction.isLive = (auction.status === "ACTIVE" || auction.status === "CREATED") && endsAt > now;
    auction.timeRemaining = auction.isLive ? endsAt - now : 0;
  }
  
  return {
    token: data.Token_by_pk,
    listing: (data.Listing && data.Listing[0]) || null,
    offers: data.Offer || [],
    auction: auction || null,
    salesHistory: data.Sale || [],
  };
}

// ─── Collections ───────────────────────────────────────────────────

async function indexerGetCollections(limit) {
  var data = await indexerQuery(`{
    NftCollection(limit: ${limit || 50}, order_by: { createdAt: desc }) {
      id owner name symbol tokenCount createdAt
    }
  }`);
  return data.NftCollection || [];
}

async function indexerGetCollection(address) {
  var addr = address.toLowerCase();
  var data = await indexerQuery(`
    query Collection($addr: String!) {
      NftCollection_by_pk(id: $addr) { id owner name symbol tokenCount createdAt createdTxHash }
      Token(where: { collection_id: { _eq: $addr } }, order_by: { mintedAt: desc }, limit: 100) {
        id tokenId owner metadataName metadataImage mintedAt
      }
    }
  `, { addr: addr });
  return {
    collection: data.NftCollection_by_pk,
    tokens: data.Token || [],
  };
}

// ─── Listings ──────────────────────────────────────────────────────

async function indexerGetListings(limit) {
  var data = await indexerQuery(`{
    Listing(where: { active: { _eq: true } }, limit: ${limit || 50}, order_by: { createdAt: desc }) {
      id token_id seller currencyAddress price splitRecipient splitBps createdAt
    }
  }`);
  return data.Listing || [];
}

// ─── Auctions ──────────────────────────────────────────────────────

async function indexerGetAuctions(options) {
  var limit = (options && options.limit) || 50;
  var statusFilter = (options && options.status) ? 'where: { status: { _eq: "' + options.status + '" } }, ' : "";
  var data = await indexerQuery(`{
    Auction(${statusFilter}limit: ${limit}, order_by: { createdAt: desc }) {
      id token_id creator currencyAddress startingTime minimumBid lengthOfAuction endsAt
      auctionType status highestBidder highestBid bidCount settledAmount app createdAt
    }
  }`);
  return (data.Auction || []).map(function(a) {
    var now = Math.floor(Date.now() / 1000);
    var endsAt = Number(a.endsAt);
    a.isLive = (a.status === "ACTIVE" || a.status === "CREATED") && endsAt > now;
    a.timeRemaining = a.isLive ? endsAt - now : 0;
    return a;
  });
}

// ─── Activity ──────────────────────────────────────────────────────

async function indexerGetActivity(options) {
  var limit = (options && options.limit) || 50;
  var conditions = [];
  if (options && options.type) conditions.push('activityType: { _eq: "' + options.type + '" }');
  if (options && options.token) conditions.push('token_id: { _eq: "' + options.token.toLowerCase() + '" }');
  var where = conditions.length ? "where: { " + conditions.join(", ") + " }, " : "";
  var data = await indexerQuery(`{
    Activity(${where}limit: ${limit}, order_by: { timestamp: desc }) {
      id activityType token_id from to currencyAddress amount timestamp txHash
    }
  }`);
  return data.Activity || [];
}

// ─── Apps ──────────────────────────────────────────────────────────

async function indexerGetApps() {
  var data = await indexerQuery(`{
    App(order_by: { registeredAt: desc }) { id feeBp registeredAt registeredTxHash }
  }`);
  return data.App || [];
}

// ─── Protocol Stats ────────────────────────────────────────────────

async function indexerGetStats() {
  var data = await indexerQuery(`{
    ProtocolConfig_by_pk(id: "protocol") { protocolShareBp lastUpdatedAt }
    chain_metadata { chain_id num_events_processed latest_processed_block }
  }`);
  return {
    protocolConfig: data.ProtocolConfig_by_pk,
    indexer: data.chain_metadata && data.chain_metadata[0],
  };
}

// ─── IPFS helpers ──────────────────────────────────────────────────

function resolveIPFS(uri) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return IPFS_GATEWAYS[0] + uri.slice(7);
  }
  return uri;
}

function shortAddr(a) {
  if (!a) return "—";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  var d = new Date(Number(ts) * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatTimeAgo(ts) {
  if (!ts) return "";
  var secs = Math.floor(Date.now() / 1000) - Number(ts);
  if (secs < 60) return secs + "s ago";
  if (secs < 3600) return Math.floor(secs / 60) + "m ago";
  if (secs < 86400) return Math.floor(secs / 3600) + "h ago";
  return Math.floor(secs / 86400) + "d ago";
}

function formatEth(wei) {
  if (!wei) return "—";
  try {
    var eth = Number(BigInt(wei)) / 1e18;
    if (eth === 0) return "0 ETH";
    if (eth < 0.001) return "<0.001 ETH";
    return eth.toFixed(4).replace(/\.?0+$/, "") + " ETH";
  } catch (e) {
    return String(wei);
  }
}

var ACTIVITY_LABELS = {
  MINT: { label: "Minted", color: "var(--green)" },
  LIST: { label: "Listed", color: "var(--accent)" },
  DELIST: { label: "Delisted", color: "var(--text-dim)" },
  SALE: { label: "Sold", color: "var(--green)" },
  OFFER_PLACED: { label: "Offer", color: "var(--purple)" },
  OFFER_ACCEPTED: { label: "Offer accepted", color: "var(--green)" },
  OFFER_CANCELLED: { label: "Offer cancelled", color: "var(--text-dim)" },
  AUCTION_CREATED: { label: "Auction created", color: "var(--accent)" },
  AUCTION_BID: { label: "Bid", color: "var(--purple)" },
  AUCTION_SETTLED: { label: "Auction settled", color: "var(--green)" },
  AUCTION_CANCELLED: { label: "Auction cancelled", color: "var(--text-dim)" },
};
