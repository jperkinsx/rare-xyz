/* global ethers, CONTRACTS, SEPOLIA_CHAIN_ID, ZERO_ADDRESS, ETHERSCAN_BASE,
   FACTORY_ABI, SOVEREIGN_NFT_ABI, MINTER_ABI, BAZAAR_ABI, APP_REGISTRY_ABI, ERC20_ABI */

// ── State ──
let provider = null;
let signer = null;
let userAddress = null;
let commandHistory = [];
let historyIndex = -1;

// Session memory for deployed collections
let lastDeployedContract = null;
let lastMintedTokenId = null;

const outputEl = document.getElementById("output");
const inputEl = document.getElementById("cmdInput");
const terminalBody = document.getElementById("terminalBody");
const walletBtn = document.getElementById("walletBtn");
const networkBadge = document.getElementById("networkBadge");

// ── Boot ──
(function boot() {
  printLine("Rare Protocol CLI v2.4.1", "line-accent");
  printLine("Sepolia Testnet — Type 'help' for available commands", "line-info");
  printDivider();
  printLine("");
  inputEl.focus();
})();

terminalBody.addEventListener("click", function (e) {
  if (e.target === terminalBody || e.target === outputEl) {
    inputEl.focus();
  }
});

// ── Input Handling ──
inputEl.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const raw = inputEl.value.trim();
    inputEl.value = "";
    if (!raw) return;
    commandHistory.push(raw);
    historyIndex = commandHistory.length;
    printCmd(raw);
    handleCommand(raw);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      inputEl.value = commandHistory[historyIndex];
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      inputEl.value = commandHistory[historyIndex];
    } else {
      historyIndex = commandHistory.length;
      inputEl.value = "";
    }
  } else if (e.key === "Tab") {
    e.preventDefault();
    tabComplete(inputEl.value);
  }
});

// ── Tab Completion ──
const ALL_COMMANDS = [
  "help", "clear", "connect", "status",
  "mint deploy", "mint token", "mint info",
  "list", "buy", "delist",
  "offer place", "offer cancel",
  "auction create", "auction bid", "auction settle", "auction cancel", "auction info",
  "query token", "query listing", "query balance",
  "apps register", "apps set-fee", "apps info",
  "contracts",
];

function tabComplete(partial) {
  const matches = ALL_COMMANDS.filter(function (c) { return c.startsWith(partial); });
  if (matches.length === 1) {
    inputEl.value = matches[0] + " ";
  } else if (matches.length > 1) {
    printLine(matches.join("  "), "line-info");
  }
}

// ── Output Helpers ──
function printLine(text, cls) {
  var div = document.createElement("div");
  div.className = "line " + (cls || "");
  div.textContent = text;
  outputEl.appendChild(div);
  scrollToBottom();
}

function printHTML(html, cls) {
  var div = document.createElement("div");
  div.className = "line " + (cls || "");
  div.innerHTML = html;
  outputEl.appendChild(div);
  scrollToBottom();
}

function printCmd(text) {
  printHTML('<span class="prompt-echo">rare&gt;</span> ' + escapeHtml(text), "line-cmd");
}

function printDivider() {
  printLine("─".repeat(60), "line-divider");
}

function printTable(rows) {
  rows.forEach(function (r) {
    var labelSpan = '<span style="color:var(--text-dim);display:inline-block;min-width:160px">' + escapeHtml(r[0]) + "</span>";
    var valCls = r[2] || "";
    var valSpan = '<span style="color:var(--' + (valCls || "text") + ')">' + escapeHtml(r[1]) + "</span>";
    printHTML(labelSpan + valSpan);
  });
}

function printTxLink(hash) {
  var url = ETHERSCAN_BASE + "/tx/" + hash;
  printHTML('Tx: <a class="tx-hash" href="' + url + '" target="_blank" rel="noopener noreferrer">' + hash.slice(0, 10) + "..." + hash.slice(-8) + "</a>");
}

function scrollToBottom() {
  terminalBody.scrollTop = terminalBody.scrollHeight;
}

function escapeHtml(s) {
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function shortAddr(a) {
  if (!a) return "—";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

function clearTerminal() {
  outputEl.innerHTML = "";
  printLine("Rare Protocol CLI v2.4.1", "line-accent");
  printLine("Terminal cleared.", "line-info");
  printDivider();
  printLine("");
}

// ── Spinner ──
function createSpinner(text) {
  var frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  var div = document.createElement("div");
  div.className = "line spinner-line";
  div.textContent = frames[0] + " " + text;
  outputEl.appendChild(div);
  scrollToBottom();
  var i = 0;
  var interval = setInterval(function () {
    i = (i + 1) % frames.length;
    div.textContent = frames[i] + " " + text;
    scrollToBottom();
  }, 80);
  return {
    stop: function (msg, cls) {
      clearInterval(interval);
      div.className = "line " + (cls || "line-success");
      div.textContent = msg;
      scrollToBottom();
    },
    remove: function () {
      clearInterval(interval);
      div.remove();
    },
  };
}

// ── Wallet ──
async function handleWalletClick() {
  if (userAddress) {
    printLine("Already connected: " + shortAddr(userAddress), "line-info");
    return;
  }
  await connectWallet();
}

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    printLine("Error: No wallet detected. Install MetaMask.", "line-error");
    return false;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    var accounts = await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = accounts[0];

    var network = await provider.getNetwork();
    if (Number(network.chainId) !== SEPOLIA_CHAIN_ID) {
      printLine("Switching to Sepolia...", "line-warn");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + SEPOLIA_CHAIN_ID.toString(16) }],
        });
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
      } catch (switchErr) {
        printLine("Error: Could not switch to Sepolia. Please switch manually.", "line-error");
        updateWalletUI(false);
        return false;
      }
    }

    updateWalletUI(true);
    printLine("✓ Wallet connected: " + shortAddr(userAddress), "line-success");
    var bal = await provider.getBalance(userAddress);
    printLine("  Balance: " + parseFloat(ethers.formatEther(bal)).toFixed(4) + " ETH", "line-info");
    return true;
  } catch (err) {
    printLine("Error: " + (err.message || err), "line-error");
    return false;
  }
}

function updateWalletUI(connected) {
  if (connected) {
    walletBtn.textContent = shortAddr(userAddress);
    walletBtn.classList.add("connected");
    networkBadge.className = "network-badge";
    networkBadge.innerHTML = '<span class="network-dot"></span> Sepolia Testnet';
  } else {
    walletBtn.textContent = "Connect Wallet";
    walletBtn.classList.remove("connected");
  }
}

async function ensureConnected() {
  if (userAddress && signer) return true;
  printLine("Connecting wallet...", "line-info");
  return await connectWallet();
}

// Listen for account/chain changes
if (typeof window.ethereum !== "undefined") {
  window.ethereum.on("accountsChanged", function (accounts) {
    if (accounts.length === 0) {
      userAddress = null;
      signer = null;
      updateWalletUI(false);
      printLine("Wallet disconnected.", "line-warn");
    } else {
      userAddress = accounts[0];
      updateWalletUI(true);
      printLine("Account changed: " + shortAddr(userAddress), "line-info");
    }
  });

  window.ethereum.on("chainChanged", function () {
    window.location.reload();
  });
}

// ── Command Router ──
async function handleCommand(raw) {
  var parts = parseArgs(raw);
  var cmd = (parts[0] || "").toLowerCase();
  var sub = (parts[1] || "").toLowerCase();
  var args = parts.slice(2);

  try {
    switch (cmd) {
      case "help": return showHelp();
      case "clear": return clearTerminal();
      case "connect": return void (await connectWallet());
      case "status": return void (await showStatus());
      case "contracts": return showContracts();
      case "mint":
        if (sub === "deploy") return void (await mintDeploy(args));
        if (sub === "token") return void (await mintToken(args));
        if (sub === "info") return void (await mintInfo(args));
        return printLine("Usage: mint deploy | mint token | mint info", "line-warn");
      case "list": return void (await listToken(args));
      case "delist": return void (await delistToken(args));
      case "buy": return void (await buyToken(args));
      case "offer":
        if (sub === "place") return void (await offerPlace(args));
        if (sub === "cancel") return void (await offerCancel(args));
        return printLine("Usage: offer place | offer cancel", "line-warn");
      case "auction":
        if (sub === "create") return void (await auctionCreate(args));
        if (sub === "bid") return void (await auctionBid(args));
        if (sub === "settle") return void (await auctionSettle(args));
        if (sub === "cancel") return void (await auctionCancel(args));
        if (sub === "info") return void (await auctionInfo(args));
        return printLine("Usage: auction create | bid | settle | cancel | info", "line-warn");
      case "query":
        if (sub === "token") return void (await queryToken(args));
        if (sub === "listing") return void (await queryListing(args));
        if (sub === "balance") return void (await queryBalance(args));
        if (sub === "activity") return void (await queryActivity(args));
        if (sub === "collection") return void (await queryCollection(args));
        return printLine("Usage: query token | listing | balance | activity | collection", "line-warn");
      case "indexer":
        if (sub === "status") return void (await indexerStatus());
        return printLine("Usage: indexer status", "line-warn");
      case "apps":
        if (sub === "register") return void (await appsRegister(args));
        if (sub === "set-fee") return void (await appsSetFee(args));
        if (sub === "info") return void (await appsInfo(args));
        return printLine("Usage: apps register | set-fee | info", "line-warn");
      default:
        printLine('Unknown command: "' + cmd + '". Type "help" for commands.', "line-error");
    }
  } catch (err) {
    var msg = err.reason || err.message || String(err);
    if (msg.includes("user rejected")) {
      printLine("✗ Transaction rejected by user.", "line-warn");
    } else {
      printLine("✗ Error: " + msg, "line-error");
    }
  }
}

// ── Arg Parser (supports --key value and --key "quoted value") ──
function parseArgs(raw) {
  var result = [];
  var current = "";
  var inQuote = false;
  var quoteChar = "";
  for (var i = 0; i < raw.length; i++) {
    var ch = raw[i];
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false; }
      else { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " ") {
      if (current) { result.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) result.push(current);
  return result;
}

function getFlag(args, flag) {
  var idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

function hasFlag(args, flag) {
  return args.indexOf(flag) !== -1;
}

// ── Help ──
function showHelp() {
  printLine("");
  printLine("RARE PROTOCOL CLI — COMMANDS", "line-header");
  printDivider();
  var groups = [
    ["Wallet", [
      ["connect", "Connect MetaMask wallet"],
      ["status", "Show wallet & network info"],
      ["contracts", "Show deployed contract addresses"],
    ]],
    ["Mint", [
      ["mint deploy --name <n> --symbol <s>", "Deploy a new NFT collection"],
      ["mint token --contract <addr> --uri <uri>", "Mint an NFT (or use last deployed)"],
      ["mint info --contract <addr>", "Show collection info"],
    ]],
    ["Marketplace", [
      ["list --contract <addr> --id <n> --price <eth>", "List token for sale"],
      ["buy --contract <addr> --id <n> --price <eth>", "Buy a listed token"],
      ["delist --contract <addr> --id <n>", "Remove listing"],
    ]],
    ["Offers", [
      ["offer place --contract <a> --id <n> --amount <eth>", "Place an offer"],
      ["offer cancel --contract <a> --id <n>", "Cancel your offer"],
    ]],
    ["Auctions", [
      ["auction create --contract <a> --id <n> --min <eth> --duration <s>", "Create auction"],
      ["auction bid --contract <a> --id <n> --amount <eth>", "Place bid"],
      ["auction settle --contract <a> --id <n>", "Settle ended auction"],
      ["auction cancel --contract <a> --id <n>", "Cancel auction"],
      ["auction info --contract <a> --id <n>", "View auction details"],
    ]],
    ["Query", [
      ["query token --contract <a> --id <n>", "Token owner, URI & metadata (indexed)"],
      ["query listing --contract <a> --id <n>", "Current sale price"],
      ["query balance --contract <a>", "Your token balance"],
      ["query activity", "Recent activity feed (from indexer)"],
      ["query collection --contract <a>", "Collection info & tokens (from indexer)"],
    ]],
    ["Indexer", [
      ["indexer status", "Check indexer sync status"],
    ]],
    ["Apps", [
      ["apps register --fee <bps>", "Register as marketplace app"],
      ["apps set-fee --fee <bps>", "Update your app fee"],
      ["apps info --app <addr>", "Look up app fee"],
    ]],
  ];
  groups.forEach(function (g) {
    printLine("");
    printLine("  " + g[0].toUpperCase(), "line-accent");
    g[1].forEach(function (c) {
      printHTML(
        '  <span style="color:var(--accent);min-width:200px;display:inline-block">' + escapeHtml(c[0]) + "</span>" +
        ' <span style="color:var(--text-dim)">' + escapeHtml(c[1]) + "</span>"
      );
    });
  });
  printLine("");
  printLine("Tip: Use Tab for auto-complete, arrow keys for history.", "line-dim");
  printLine("");
}

// ── Status ──
async function showStatus() {
  if (!userAddress) {
    printLine("No wallet connected. Run 'connect' first.", "line-warn");
    return;
  }
  var network = await provider.getNetwork();
  var bal = await provider.getBalance(userAddress);
  printLine("");
  printTable([
    ["Address", userAddress, "accent"],
    ["Network", "Sepolia (chain " + Number(network.chainId) + ")", "green"],
    ["Balance", parseFloat(ethers.formatEther(bal)).toFixed(4) + " ETH", "text"],
  ]);
  if (lastDeployedContract) {
    printTable([["Last Collection", lastDeployedContract, "purple"]]);
  }
  if (lastMintedTokenId !== null) {
    printTable([["Last Minted ID", String(lastMintedTokenId), "text"]]);
  }
  printLine("");
}

function showContracts() {
  printLine("");
  printLine("DEPLOYED CONTRACTS (Sepolia)", "line-header");
  printDivider();
  printTable([
    ["SuperRareBazaar", CONTRACTS.bazaar, "purple"],
    ["RareMinter", CONTRACTS.minter, "purple"],
    ["NFT Factory", CONTRACTS.factory, "purple"],
    ["AppRegistry", CONTRACTS.appRegistry, "purple"],
    ["RARE Token", CONTRACTS.rareToken, "purple"],
  ]);
  printLine("");
}

// ── MINT DEPLOY ──
async function mintDeploy(args) {
  if (!(await ensureConnected())) return;
  var name = getFlag(args, "--name") || "My Collection";
  var symbol = getFlag(args, "--symbol") || "ART";

  printLine("");
  var spin = createSpinner("Deploying NFT collection \"" + name + "\" (" + symbol + ")...");
  var factory = new ethers.Contract(CONTRACTS.factory, FACTORY_ABI, signer);
  var tx = await factory.createSovereignNFTContract(name, symbol);
  spin.stop("⏳ Transaction sent. Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  // Find ContractCreated event
  var contractAddr = null;
  for (var i = 0; i < receipt.logs.length; i++) {
    try {
      var parsed = factory.interface.parseLog({ topics: receipt.logs[i].topics, data: receipt.logs[i].data });
      if (parsed && parsed.name === "ContractCreated") {
        contractAddr = parsed.args[0];
        break;
      }
    } catch (_e) { /* skip */ }
  }

  if (!contractAddr) {
    // Fallback: look for the address in the logs
    contractAddr = receipt.logs[0] ? receipt.logs[0].address : null;
  }

  lastDeployedContract = contractAddr;
  printLine("");
  printLine("✓ Collection deployed", "line-success");
  printTable([
    ["Name", name, "text"],
    ["Symbol", symbol, "text"],
    ["Contract", contractAddr || "check tx logs", "purple"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
  printLine('Tip: Run "mint token --uri <tokenURI>" to mint to this collection.', "line-dim");
  printLine("");
}

// ── MINT TOKEN ──
async function mintToken(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var uri = getFlag(args, "--uri") || "ipfs://QmPlaceholder";

  if (!contract) {
    printLine("Error: No --contract specified and no collection deployed this session.", "line-error");
    printLine('Deploy one with "mint deploy --name MyArt --symbol ART" first.', "line-dim");
    return;
  }

  printLine("");
  var spin = createSpinner("Minting NFT to " + shortAddr(contract) + "...");
  var nft = new ethers.Contract(contract, SOVEREIGN_NFT_ABI, signer);

  var tx = await nft.mintTo(uri, userAddress, userAddress);

  spin.stop("⏳ Transaction sent. Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  // Find Transfer event to get tokenId
  var tokenId = null;
  for (var i = 0; i < receipt.logs.length; i++) {
    try {
      var parsed = nft.interface.parseLog({ topics: receipt.logs[i].topics, data: receipt.logs[i].data });
      if (parsed && parsed.name === "Transfer") {
        tokenId = parsed.args[2];
        break;
      }
    } catch (_e2) { /* skip */ }
  }

  lastMintedTokenId = tokenId ? Number(tokenId) : null;
  printLine("");
  printLine("✓ NFT minted", "line-success");
  printTable([
    ["Contract", contract, "purple"],
    ["Token ID", tokenId ? String(tokenId) : "check tx", "accent"],
    ["URI", uri, "text"],
    ["Owner", shortAddr(userAddress), "green"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
}

// ── MINT INFO ──
async function mintInfo(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  if (!contract) {
    printLine("Error: Specify --contract or deploy a collection first.", "line-error");
    return;
  }
  var nft = new ethers.Contract(contract, SOVEREIGN_NFT_ABI, provider);
  var spin = createSpinner("Fetching collection info...");
  try {
    var name = await nft.name();
    var symbol = await nft.symbol();
    var supply = await nft.totalSupply();
    spin.stop("✓ Collection info", "line-success");
    printTable([
      ["Name", name, "text"],
      ["Symbol", symbol, "text"],
      ["Total Supply", String(supply), "accent"],
      ["Contract", contract, "purple"],
    ]);
  } catch (err) {
    spin.stop("✗ Could not read contract — may not be a SovereignNFT", "line-error");
  }
  printLine("");
}

// ── LIST ──
async function listToken(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id") || (lastMintedTokenId !== null ? String(lastMintedTokenId) : null);
  var price = getFlag(args, "--price") || "0.01";
  var app = getFlag(args, "--app") || ZERO_ADDRESS;

  if (!contract || tokenId === null) {
    printLine("Error: Specify --contract and --id (or deploy & mint first).", "line-error");
    return;
  }

  // Check approval
  printLine("");
  var nft = new ethers.Contract(contract, SOVEREIGN_NFT_ABI, signer);
  var approved = await nft.isApprovedForAll(userAddress, CONTRACTS.bazaar);
  if (!approved) {
    var spinApprove = createSpinner("Approving Bazaar to transfer your NFTs...");
    var appTx = await nft.setApprovalForAll(CONTRACTS.bazaar, true);
    await appTx.wait();
    spinApprove.stop("✓ Bazaar approved", "line-success");
  }

  var weiPrice = ethers.parseEther(price);
  var spin = createSpinner("Listing token #" + tokenId + " for " + price + " ETH...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.setSalePrice(contract, tokenId, ZERO_ADDRESS, weiPrice, ZERO_ADDRESS, [], [], app);
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("");
  printLine("✓ Token listed for sale", "line-success");
  printTable([
    ["Contract", shortAddr(contract), "purple"],
    ["Token ID", tokenId, "accent"],
    ["Price", price + " ETH", "green"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
}

// ── BUY ──
async function buyToken(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");
  var price = getFlag(args, "--price");

  if (!contract || !tokenId || !price) {
    printLine("Error: Specify --contract, --id, and --price.", "line-error");
    return;
  }

  var weiPrice = ethers.parseEther(price);
  var spin = createSpinner("Buying token #" + tokenId + " for " + price + " ETH...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.buy(contract, tokenId, ZERO_ADDRESS, weiPrice, { value: weiPrice });
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("");
  printLine("✓ Token purchased", "line-success");
  printTable([
    ["Contract", shortAddr(contract), "purple"],
    ["Token ID", tokenId, "accent"],
    ["Price Paid", price + " ETH", "green"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
}

// ── DELIST ──
async function delistToken(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id") || (lastMintedTokenId !== null ? String(lastMintedTokenId) : null);

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Removing listing for token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.removeSalePrice(contract, tokenId, ZERO_ADDRESS);
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("");
  printLine("✓ Listing removed", "line-success");
  printTxLink(receipt.hash);
  printLine("");
}

// ── OFFER PLACE ──
async function offerPlace(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");
  var amount = getFlag(args, "--amount") || "0.01";
  var convertible = hasFlag(args, "--convertible");
  var app = getFlag(args, "--app") || ZERO_ADDRESS;

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var weiAmount = ethers.parseEther(amount);
  var spin = createSpinner("Placing offer of " + amount + " ETH on token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.offer(contract, tokenId, ZERO_ADDRESS, weiAmount, convertible, app, { value: weiAmount });
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("");
  printLine("✓ Offer placed", "line-success");
  printTable([
    ["Contract", shortAddr(contract), "purple"],
    ["Token ID", tokenId, "accent"],
    ["Amount", amount + " ETH", "green"],
    ["Convertible", convertible ? "Yes" : "No", "text"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
}

// ── OFFER CANCEL ──
async function offerCancel(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Canceling offer on token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.cancelOffer(contract, tokenId, ZERO_ADDRESS);
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();
  printLine("✓ Offer cancelled", "line-success");
  printTxLink(receipt.hash);
  printLine("");
}

// ── AUCTION CREATE ──
async function auctionCreate(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id") || (lastMintedTokenId !== null ? String(lastMintedTokenId) : null);
  var minBid = getFlag(args, "--min") || "0.01";
  var duration = getFlag(args, "--duration") || "3600"; // 1 hour default
  var app = getFlag(args, "--app") || ZERO_ADDRESS;

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  // Check approval
  var nft = new ethers.Contract(contract, SOVEREIGN_NFT_ABI, signer);
  var approved = await nft.isApprovedForAll(userAddress, CONTRACTS.bazaar);
  if (!approved) {
    var spinApprove = createSpinner("Approving Bazaar...");
    var appTx = await nft.setApprovalForAll(CONTRACTS.bazaar, true);
    await appTx.wait();
    spinApprove.stop("✓ Bazaar approved", "line-success");
  }

  // COLDIE_AUCTION type (reserve auction)
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var coldieType = await bazaar.COLDIE_AUCTION();
  var weiMin = ethers.parseEther(minBid);
  var now = Math.floor(Date.now() / 1000);

  printLine("");
  var spin = createSpinner("Creating auction for token #" + tokenId + "...");
  var tx = await bazaar.configureAuction(coldieType, contract, tokenId, weiMin, ZERO_ADDRESS, duration, now, [], [], app);
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("");
  printLine("✓ Auction created", "line-success");
  printTable([
    ["Contract", shortAddr(contract), "purple"],
    ["Token ID", tokenId, "accent"],
    ["Min Bid", minBid + " ETH", "green"],
    ["Duration", duration + "s (" + Math.round(parseInt(duration) / 60) + " min)", "text"],
    ["Type", "Reserve (Coldie)", "text"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
}

// ── AUCTION BID ──
async function auctionBid(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");
  var amount = getFlag(args, "--amount");

  if (!contract || !tokenId || !amount) {
    printLine("Error: Specify --contract, --id, and --amount.", "line-error");
    return;
  }

  var weiAmount = ethers.parseEther(amount);
  var spin = createSpinner("Bidding " + amount + " ETH on token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.bid(contract, tokenId, ZERO_ADDRESS, weiAmount, { value: weiAmount });
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("✓ Bid placed: " + amount + " ETH", "line-success");
  printTxLink(receipt.hash);
  printLine("");
}

// ── AUCTION SETTLE ──
async function auctionSettle(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Settling auction for token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.settleAuction(contract, tokenId);
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("✓ Auction settled", "line-success");
  printTxLink(receipt.hash);
  printLine("");
}

// ── AUCTION CANCEL ──
async function auctionCancel(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Canceling auction for token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, signer);
  var tx = await bazaar.cancelAuction(contract, tokenId);
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("✓ Auction cancelled", "line-success");
  printTxLink(receipt.hash);
  printLine("");
}

// ── AUCTION INFO ──
async function auctionInfo(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id");

  if (!contract || !tokenId) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Fetching auction details...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, provider);
  var details = await bazaar.getAuctionDetails(contract, tokenId);

  var creator = details[0];
  if (creator === ZERO_ADDRESS) {
    spin.stop("No auction found for this token.", "line-warn");
    return;
  }

  var noAuction = await bazaar.NO_AUCTION();
  if (details[6] === noAuction) {
    spin.stop("No active auction for this token.", "line-warn");
    return;
  }

  spin.stop("✓ Auction details", "line-success");
  printTable([
    ["Creator", shortAddr(creator), "purple"],
    ["Start Time", new Date(Number(details[2]) * 1000).toLocaleString(), "text"],
    ["Duration", String(Number(details[3])) + "s", "text"],
    ["Currency", details[4] === ZERO_ADDRESS ? "ETH" : shortAddr(details[4]), "text"],
    ["Min Bid", ethers.formatEther(details[5]) + " ETH", "green"],
  ]);

  // Check current bid
  var bidInfo = await bazaar.auctionBids(contract, tokenId);
  if (bidInfo[0] !== ZERO_ADDRESS) {
    printLine("");
    printLine("  Current Bid", "line-header");
    printTable([
      ["Bidder", shortAddr(bidInfo[0]), "accent"],
      ["Amount", ethers.formatEther(bidInfo[2]) + " ETH", "green"],
    ]);
  }
  printLine("");
}

// ── QUERY TOKEN ──
async function queryToken(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id") || (lastMintedTokenId !== null ? String(lastMintedTokenId) : null);

  if (!contract || tokenId === null) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Querying token #" + tokenId + "...");

  // Try indexer first, fall back to onchain
  try {
    var data = await indexerGetToken(contract, tokenId);
    if (data && data.token) {
      var t = data.token;
      spin.stop("✓ Token info (indexed)", "line-success");
      printTable([
        ["Contract", shortAddr(contract), "purple"],
        ["Token ID", String(t.tokenId), "accent"],
        ["Owner", shortAddr(t.owner), "green"],
        ["Creator", shortAddr(t.creator), "purple"],
        ["URI", t.tokenURI || "—", "text"],
      ]);
      if (t.metadataName || t.metadataImage) {
        printLine("");
        printLine("  Metadata:", "line-info");
        if (t.metadataName) printLine("    Name:  " + t.metadataName, "line-text");
        if (t.metadataImage) printLine("    Image: " + t.metadataImage, "line-text");
      }
      if (data.listing) {
        printLine("");
        printLine("  Active Listing:", "line-info");
        printLine("    Price:  " + formatEth(data.listing.price), "line-text");
        printLine("    Seller: " + shortAddr(data.listing.seller), "line-text");
      }
      if (data.auction && data.auction.isLive) {
        printLine("");
        printLine("  Live Auction:", "line-info");
        printLine("    Type:     " + (data.auction.auctionType || "—"), "line-text");
        printLine("    High Bid: " + formatEth(data.auction.highestBid), "line-text");
        printLine("    Bidder:   " + shortAddr(data.auction.highestBidder), "line-text");
        printLine("    Time Left: " + data.auction.timeRemaining + "s", "line-text");
      }
      if (data.offers && data.offers.length > 0) {
        printLine("");
        printLine("  Active Offers: " + data.offers.length, "line-info");
        data.offers.slice(0, 3).forEach(function(o) {
          printLine("    " + formatEth(o.amount) + " from " + shortAddr(o.bidder), "line-text");
        });
      }
      printLine("");
      return;
    }
  } catch (e) {
    // Indexer unavailable, fall back to onchain
  }

  // Fallback: direct contract read
  var nft = new ethers.Contract(contract, SOVEREIGN_NFT_ABI, provider);
  try {
    var owner = await nft.ownerOf(tokenId);
    var uri = await nft.tokenURI(tokenId);
    spin.stop("✓ Token info (onchain)", "line-success");
    printTable([
      ["Contract", shortAddr(contract), "purple"],
      ["Token ID", tokenId, "accent"],
      ["Owner", shortAddr(owner), "green"],
      ["URI", uri, "text"],
    ]);
  } catch (err) {
    spin.stop("✗ Token not found or contract error", "line-error");
  }
  printLine("");
}

// ── QUERY LISTING ──
async function queryListing(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  var tokenId = getFlag(args, "--id") || (lastMintedTokenId !== null ? String(lastMintedTokenId) : null);

  if (!contract || tokenId === null) {
    printLine("Error: Specify --contract and --id.", "line-error");
    return;
  }

  var spin = createSpinner("Checking listing for token #" + tokenId + "...");
  var bazaar = new ethers.Contract(CONTRACTS.bazaar, BAZAAR_ABI, provider);
  var result = await bazaar.getSalePrice(contract, tokenId, ZERO_ADDRESS);
  var seller = result[0];
  var amount = result[2];

  if (seller === ZERO_ADDRESS || amount === 0n) {
    spin.stop("No active listing for this token.", "line-warn");
  } else {
    spin.stop("✓ Listing found", "line-success");
    printTable([
      ["Seller", shortAddr(seller), "purple"],
      ["Price", ethers.formatEther(amount) + " ETH", "green"],
      ["Currency", result[1] === ZERO_ADDRESS ? "ETH" : shortAddr(result[1]), "text"],
    ]);
  }
  printLine("");
}

// ── QUERY BALANCE ──
async function queryBalance(args) {
  if (!(await ensureConnected())) return;
  var contract = getFlag(args, "--contract") || lastDeployedContract;

  if (!contract) {
    printLine("Error: Specify --contract.", "line-error");
    return;
  }

  var spin = createSpinner("Checking balance...");
  var nft = new ethers.Contract(contract, SOVEREIGN_NFT_ABI, provider);
  try {
    var name = await nft.name();
    var bal = await nft.balanceOf(userAddress);
    spin.stop("✓ Balance", "line-success");
    printTable([
      ["Collection", name, "text"],
      ["Your Balance", String(bal) + " tokens", "green"],
    ]);
  } catch (err) {
    spin.stop("✗ Could not read balance", "line-error");
  }
  printLine("");
}

// ── APPS REGISTER ──
async function appsRegister(args) {
  if (!(await ensureConnected())) return;
  var fee = getFlag(args, "--fee") || "250"; // 2.5% default

  printLine("");
  var spin = createSpinner("Registering as marketplace app with " + fee + " bps fee...");
  var registry = new ethers.Contract(CONTRACTS.appRegistry, APP_REGISTRY_ABI, signer);
  var tx = await registry.registerApp(parseInt(fee));
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("");
  printLine("✓ App registered", "line-success");
  printTable([
    ["App Address", shortAddr(userAddress), "purple"],
    ["Fee", fee + " bps (" + (parseInt(fee) / 100).toFixed(2) + "%)", "green"],
  ]);
  printTxLink(receipt.hash);
  printLine("");
}

// ── APPS SET-FEE ──
async function appsSetFee(args) {
  if (!(await ensureConnected())) return;
  var fee = getFlag(args, "--fee");
  if (!fee) {
    printLine("Error: Specify --fee <basisPoints>.", "line-error");
    return;
  }

  var spin = createSpinner("Updating app fee to " + fee + " bps...");
  var registry = new ethers.Contract(CONTRACTS.appRegistry, APP_REGISTRY_ABI, signer);
  var tx = await registry.setAppFee(parseInt(fee));
  spin.stop("⏳ Waiting for confirmation...", "line-info");
  var receipt = await tx.wait();

  printLine("✓ Fee updated to " + fee + " bps (" + (parseInt(fee) / 100).toFixed(2) + "%)", "line-success");
  printTxLink(receipt.hash);
  printLine("");
}

// ── APPS INFO ──
async function appsInfo(args) {
  if (!(await ensureConnected())) return;
  var app = getFlag(args, "--app") || userAddress;

  var spin = createSpinner("Looking up app fee for " + shortAddr(app) + "...");
  var registry = new ethers.Contract(CONTRACTS.appRegistry, APP_REGISTRY_ABI, provider);
  try {
    var fee = await registry.getAppFee(app);
    if (Number(fee) === 0) {
      spin.stop("App not registered (fee = 0).", "line-warn");
    } else {
      spin.stop("✓ App info", "line-success");
      printTable([
        ["App", shortAddr(app), "purple"],
        ["Fee", String(fee) + " bps (" + (Number(fee) / 100).toFixed(2) + "%)", "green"],
      ]);
    }
  } catch (err) {
    spin.stop("✗ Could not read app info", "line-error");
  }
  printLine("");
}

// ══════════════════════════════════════════════════════════════════════
// INDEXER-POWERED COMMANDS
// ══════════════════════════════════════════════════════════════════════

// ── QUERY ACTIVITY (from indexer) ──
async function queryActivity(args) {
  var spin = createSpinner("Fetching recent activity from indexer...");
  try {
    var limit = parseInt(getFlag(args, "--limit") || "15");
    var typeFilter = getFlag(args, "--type");
    var opts = { limit: limit };
    if (typeFilter) opts.type = typeFilter.toUpperCase();
    var activities = await indexerGetActivity(opts);

    if (!activities || activities.length === 0) {
      spin.stop("No activity found.", "line-warn");
      printLine("");
      return;
    }

    spin.stop("✓ Recent activity (" + activities.length + " events)", "line-success");
    printLine("");
    activities.forEach(function(a) {
      var info = ACTIVITY_LABELS[a.activityType] || { label: a.activityType };
      var line = "  " + info.label.padEnd(18) + " ";
      line += (a.token_id || "").slice(0, 24).padEnd(26) + " ";
      if (a.amount) line += formatEth(a.amount).padEnd(14);
      else line += "".padEnd(14);
      line += formatTimeAgo(a.timestamp);
      printLine(line, "line-text");
    });
  } catch (e) {
    spin.stop("✗ " + e.message, "line-error");
  }
  printLine("");
}

// ── QUERY COLLECTION (from indexer) ──
async function queryCollection(args) {
  var contract = getFlag(args, "--contract") || lastDeployedContract;
  if (!contract) {
    printLine("Error: Specify --contract.", "line-error");
    return;
  }

  var spin = createSpinner("Fetching collection from indexer...");
  try {
    var data = await indexerGetCollection(contract);

    if (!data || !data.collection) {
      spin.stop("Collection not found in indexer.", "line-warn");
      printLine("");
      return;
    }

    var c = data.collection;
    spin.stop("✓ Collection info (indexed)", "line-success");
    printTable([
      ["Name", c.name || "Unnamed", "text"],
      ["Symbol", c.symbol || "—", "accent"],
      ["Owner", shortAddr(c.owner), "purple"],
      ["Tokens", String(c.tokenCount), "green"],
      ["Address", shortAddr(c.id), "purple"],
    ]);

    if (data.tokens && data.tokens.length > 0) {
      printLine("");
      printLine("  Tokens:", "line-info");
      data.tokens.forEach(function(t) {
        var name = t.metadataName || ("Token #" + t.tokenId);
        printLine("    #" + t.tokenId + "  " + name + "  (owner: " + shortAddr(t.owner) + ")", "line-text");
      });
    }
  } catch (e) {
    spin.stop("✗ " + e.message, "line-error");
  }
  printLine("");
}

// ── INDEXER STATUS ──
async function indexerStatus() {
  var spin = createSpinner("Checking indexer status...");
  try {
    var stats = await indexerGetStats();
    var idx = stats.indexer;
    if (idx) {
      spin.stop("✓ Indexer status", "line-success");
      printTable([
        ["Chain", "Sepolia (" + idx.chain_id + ")", "accent"],
        ["Latest Block", idx.latest_processed_block > 0 ? String(idx.latest_processed_block) : "syncing...", "green"],
        ["Events Processed", String(idx.num_events_processed || 0), "green"],
        ["Endpoint", INDEXER_ENDPOINT.replace("https://", "").slice(0, 45) + "...", "text"],
      ]);
    } else {
      spin.stop("Indexer returned no metadata.", "line-warn");
    }
    if (stats.protocolConfig) {
      printLine("");
      printLine("  Protocol Config:", "line-info");
      printLine("    Share: " + stats.protocolConfig.protocolShareBp + " bps (" + (stats.protocolConfig.protocolShareBp / 100).toFixed(1) + "%)", "line-text");
    }
  } catch (e) {
    spin.stop("✗ " + e.message, "line-error");
  }
  printLine("");
}
