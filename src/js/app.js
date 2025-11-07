const Web3 = require('web3');
const contract = require('@truffle/contract');

// --- Contract Artifacts ---
const electionFactoryArtifacts = require('../../build/contracts/ElectionFactory.json');
const ElectionFactory = contract(electionFactoryArtifacts);

// A simple utility to manage the application state and DOM elements
const UI = {
  elements: {
    accountAddress: $("#accountAddress"),
    contractAddress: $("#contractAddress"),
    debugInfo: $("#debugInfo"),
    networkInfo: $("#networkInfo"),
    activeElections: $("#activeElections"),
    switchAccountBtn: $("#switchAccountBtn"),
    refreshPageBtn: $("#refreshPageBtn"),
  },

  updateAccount: (address) => {
    UI.elements.accountAddress.html("Your Account: " + (address || "Not connected"));
  },
  updateContractAddress: (address) => {
    UI.elements.contractAddress.html("Contract Address: " + address);
  },
  updateDebugInfo: (message) => {
    UI.elements.debugInfo.html("Status: " + message);
  },
  updateNetworkInfo: (name) => {
    UI.elements.networkInfo.html("Network: " + name);
  },
  updateElections: (html) => {
    UI.elements.activeElections.html(html);
  },
  
  // Maps chain ID to a readable network name
  getNetworkName: (chainId) => {
    switch(chainId) {
      case "0x1": return "Ethereum Mainnet";
      case "0x3": return "Ropsten Testnet";
      case "0x4": return "Rinkeby Testnet";
      case "0x5": return "Goerli Testnet";
      case "0x539": return "Ganache Local";
      default: return `Local Network (${chainId})`;
    }
  }
};


// --- Core Application Logic ---
window.VoterApp = {
  account: null,
  contractInstance: null,

  init: async function() {
    console.log("Starting decentralized voting application...");
    UI.updateDebugInfo("Initializing...");
    
    // 1. Web3 and Metamask Check
    if (typeof window.ethereum === 'undefined') {
      console.error("Metamask not detected!");
      alert("Metamask not detected! Please install the extension and refresh the page.");
      UI.updateDebugInfo("Error: Metamask not detected.");
      return;
    }
    
    try {
      // 2. Request Account Access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length === 0) {
        throw new Error("No accounts found. Please unlock Metamask.");
      }
      
      this.account = window.ethereum.selectedAddress;
      UI.updateAccount(this.account);
      
      // 3. Set up Contract Provider
      ElectionFactory.setProvider(window.ethereum);
      ElectionFactory.defaults({from: this.account, gas: 6654755});
      
      // 4. Get deployed contract instance
      this.contractInstance = await ElectionFactory.deployed();
      UI.updateContractAddress(this.contractInstance.address);
      UI.updateDebugInfo("Connected to blockchain");
      
      // 5. Get and Display Network Info
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      UI.updateNetworkInfo(UI.getNetworkName(chainId));
      
      // 6. Load Elections and Setup Handlers
      await this.loadActiveElections();
      this.setupDOMEventListeners();
      
    } catch (error) {
      console.error("Initialization error:", error);
      alert("Error initializing application: " + error.message);
      UI.updateDebugInfo(`Error initializing: ${error.message}`);
      UI.updateAccount(null);
    }
  },
  
  setupDOMEventListeners: function() {
    // Event listeners for Metamask changes are set up outside init for continuous listening
    
    UI.elements.switchAccountBtn.click(async function() {
      console.log("Switch account button clicked");
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
        // eth_requestAccounts triggers the 'accountsChanged' listener which reloads the page.
        await window.ethereum.request({ method: 'eth_requestAccounts' });
      } catch (error) {
        console.error("Error switching account:", error);
        UI.updateDebugInfo(`Error switching account: ${error.message}`);
      }
    });

    UI.elements.refreshPageBtn.click(function() {
      console.log("Refresh page button clicked");
      window.location.reload();
    });
  },

  loadActiveElections: async function() {
    const instance = this.contractInstance;
    UI.updateElections("<p>Loading elections...</p>");
    
    try {
      const electionCount = await instance.getElectionCount();
      const count = electionCount.toNumber();
      
      if (count === 0) {
        UI.updateElections("<p>No elections found. Please check back later.</p>");
        return;
      }
      
      let electionsHtml = `
        <table class="elections-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      const now = Math.floor(Date.now() / 1000);
      
      for (let i = 1; i <= count; i++) {
        const election = await instance.getElection(i);
        const id = election[0].toNumber();
        const name = election[1];
        const startTime = election[2].toNumber();
        const endTime = election[3].toNumber();
        
        let status = "Upcoming";
        let actionButton = "";
        
        if (now >= startTime && now < endTime) {
          status = "Active";
          const hasVoted = await instance.hasVoted(id, {from: this.account}); // Check vote status for current account
          
          if (hasVoted) {
            actionButton = `<button class="btn-voted" disabled>Already Voted</button>`;
          } else {
            actionButton = `<button class="btn-vote" data-id="${id}">Vote Now</button>`;
          }
        } else if (now >= endTime) {
          status = "Ended";
          actionButton = `<button class="btn-view" data-id="${id}">View Results</button>`;
        } else {
          actionButton = `<span>Not started yet</span>`;
        }
        
        let statusClass = (status === "Active") ? "status-active" : 
                          (status === "Ended") ? "status-ended" : "status-upcoming";
        
        electionsHtml += `
          <tr>
            <td>${id}</td>
            <td>${name}</td>
            <td>${new Date(startTime * 1000).toLocaleString()}</td>
            <td>${new Date(endTime * 1000).toLocaleString()}</td>
            <td><span class="${statusClass}">${status}</span></td>
            <td>${actionButton}</td>
          </tr>
        `;
      }
      
      electionsHtml += `</tbody></table>`;
      
      UI.updateElections(electionsHtml);
      
      // Add event listeners for the newly rendered buttons
      $(".btn-vote").click((e) => this.showVotingBallot($(e.currentTarget).data("id")));
      $(".btn-view").click((e) => this.viewElectionResults($(e.currentTarget).data("id")));
      
    } catch (error) {
      console.error("Error loading elections:", error);
      UI.updateElections(`<p style='color:red'>Error loading elections: ${error.message}</p>`);
    }
  },
  
  showVotingBallot: async function(electionId) {
    const instance = this.contractInstance;
    try {
      const election = await instance.getElection(electionId);
      const name = election[1];
      const startTime = election[2].toNumber();
      const endTime = election[3].toNumber();
      const candidateCount = election[4].toNumber();
      
      let ballotHtml = `
        <h3>Vote in "${name}"</h3>
        <p>Election period: ${new Date(startTime * 1000).toLocaleString()} - ${new Date(endTime * 1000).toLocaleString()}</p>
        <form id="voteForm">
          <div class="candidates-list">
      `;
      
      for (let i = 1; i <= candidateCount; i++) {
        const candidate = await instance.getCandidate(electionId, i);
        const id = candidate[0].toNumber();
        const cName = candidate[1];
        const party = candidate[2];
        
        ballotHtml += `
          <div class="candidate-option">
            <input type="radio" name="candidateId" id="candidate-${id}" value="${id}" required>
            <label for="candidate-${id}">
              <strong>${cName}</strong> (${party})
            </label>
          </div>
        `;
      }
      
      ballotHtml += `
          </div>
          <div class="form-actions">
            <input type="hidden" id="electionId" value="${electionId}">
            <button type="submit" id="submitVote" class="btn-primary">Submit Vote</button>
            <button type="button" id="cancelVote" class="btn-secondary">Cancel</button>
          </div>
          <div id="voteStatus"></div>
        </form>
      `;
      
      UI.updateElections(ballotHtml);
      
      // Add event listeners for the form
      $("#voteForm").submit((e) => {
        e.preventDefault();
        this.submitVote();
      });
      
      $("#cancelVote").click(() => this.loadActiveElections());
      
    } catch (error) {
      console.error("Error showing ballot:", error);
      UI.updateElections(`<p style='color:red'>Error showing ballot: ${error.message}</p>`);
    }
  },
  
  submitVote: async function() {
    const instance = this.contractInstance;
    const voteStatus = $("#voteStatus");
    const submitBtn = $("#submitVote");

    try {
      voteStatus.html("Processing your vote...");
      submitBtn.prop("disabled", true);
      
      const electionId = parseInt($("#electionId").val());
      const candidateId = parseInt($("input[name='candidateId']:checked").val());
      
      if (isNaN(candidateId)) {
          voteStatus.html("<p style='color:red'>Please select a candidate.</p>");
          submitBtn.prop("disabled", false);
          return;
      }

      console.log("Submitting vote for candidate", candidateId, "in election", electionId);
      
      const result = await instance.vote(electionId, candidateId, {from: this.account});
      
      voteStatus.html(`<p style='color:green'>Your vote has been recorded successfully!</p>`);
      voteStatus.append(`<p>Transaction hash: ${result.tx}</p>`);
      
      // Reload after 3 seconds to show updated election list
      setTimeout(() => this.loadActiveElections(), 3000);
      
    } catch (error) {
      console.error("Error submitting vote:", error);
      voteStatus.html(`<p style='color:red'>Error: ${error.message}</p>`);
      submitBtn.prop("disabled", false);
    }
  },
  
  viewElectionResults: async function(electionId) {
    const instance = this.contractInstance;
    try {
      const election = await instance.getElection(electionId);
      const name = election[1];
      const startTime = election[2].toNumber();
      const endTime = election[3].toNumber();
      const candidateCount = election[4].toNumber();
      
      let resultsHtml = `
        <h3>Results for "${name}"</h3>
        <p>Election period: ${new Date(startTime * 1000).toLocaleString()} - ${new Date(endTime * 1000).toLocaleString()}</p>
        <table class="results-table elections-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Party</th>
              <th>Votes</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      let totalVotes = 0;
      let candidates = [];
      
      for (let i = 1; i <= candidateCount; i++) {
        const candidate = await instance.getCandidate(electionId, i);
        const id = candidate[0].toNumber();
        const cName = candidate[1];
        const party = candidate[2];
        const votes = candidate[3].toNumber();
        
        totalVotes += votes;
        candidates.push({ id, name: cName, party, votes });
      }
      
      // Sort candidates by votes (descending)
      candidates.sort((a, b) => b.votes - a.votes);
      
      candidates.forEach(candidate => {
        const percentage = totalVotes > 0 ? ((candidate.votes / totalVotes) * 100).toFixed(2) : 0;
        
        resultsHtml += `
          <tr>
            <td>${candidate.id}</td>
            <td>${candidate.name}</td>
            <td>${candidate.party}</td>
            <td>${candidate.votes} (${percentage}%)</td>
          </tr>
        `;
      });
      
      resultsHtml += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Total Votes:</td>
              <td>${totalVotes}</td>
            </tr>
          </tfoot>
        </table>
        <button id="backToElections" class="btn-secondary">Back to Elections</button>
      `;
      
      UI.updateElections(resultsHtml);
      
      // Add event listener for back button
      $("#backToElections").click(() => this.loadActiveElections());
      
    } catch (error) {
      console.error("Error viewing election results:", error);
      UI.updateElections(`<p style='color:red'>Error viewing results: ${error.message}</p>`);
    }
  }
};

// --- Metamask Event Listeners (Global) ---
if (window.ethereum) {
  // Use a dedicated listener for account changes
  window.ethereum.on('accountsChanged', function (accounts) {
    console.log('Account changed to:', accounts[0]);
    UI.updateAccount(accounts[0]);
    UI.updateDebugInfo("Account changed. Refreshing page...");
    // Reload to ensure the new account context is fully loaded
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  });
  
  // Use a dedicated listener for chain changes
  window.ethereum.on('chainChanged', function (chainId) {
    console.log('Network changed to:', chainId);
    UI.updateNetworkInfo(UI.getNetworkName(chainId));
    UI.updateDebugInfo("Network changed. Refreshing page...");
    // Reload to re-establish contract connection on the new network
    window.location.reload();
  });
}

// --- Application Entry Point ---
window.addEventListener("load", function() {
  if (typeof web3 !== "undefined") {
    // Web3 is detected (e.g., from Metamask)
    window.eth = new Web3(window.ethereum);
    console.warn("Using web3 detected from external source like Metamask");
  } else {
    // Fallback for non-Metamask environments (should be avoided in production)
    console.warn("No web3 detected. Falling back to http://127.0.0.1:9545.");
    window.eth = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:9545"));
  }
  
  window.VoterApp.init();
});