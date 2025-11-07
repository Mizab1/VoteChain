const Web3 = require('web3');
const contract = require('@truffle/contract');
const electionFactoryArtifacts = require('../../build/contracts/ElectionFactory.json');
const ElectionFactory = contract(electionFactoryArtifacts);

/**
 * Admin Application Module
 * Handles election creation, management, and real-time results
 */
window.AdminApp = {
  account: null,
  tallyInterval: null,
  contractInstance: null,
  candidateCounter: 1,

  /**
   * Initialize the application
   */
  async init() {
    console.log("Starting admin application...");

    if (!this.checkMetamask()) return;

    try {
      await this.setupWeb3();
      await this.setupContract();
      await this.loadInitialData();
      this.setupEventListeners();
      this.displayNetworkInfo();
    } catch (error) {
      this.handleError("Error initializing application", error);
    }
  },

  /**
   * Check if Metamask is installed
   */
  checkMetamask() {
    if (typeof window.ethereum === 'undefined') {
      console.error("Metamask not detected!");
      alert("Metamask not detected! Please install Metamask extension and refresh the page.");
      return false;
    }
    return true;
  },

  /**
   * Setup Web3 connection
   */
  async setupWeb3() {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    console.log("Connected accounts:", accounts);

    if (accounts.length === 0) {
      throw new Error("No accounts found. Please unlock Metamask.");
    }

    this.account = window.ethereum.selectedAddress;
    console.log("Using account:", this.account);
    $("#accountAddress").html("Your Account: " + this.account);
  },

  /**
   * Setup contract instance
   */
  async setupContract() {
    ElectionFactory.setProvider(window.ethereum);
    ElectionFactory.defaults({ from: this.account, gas: 6654755 });
    
    this.contractInstance = await ElectionFactory.deployed();
    console.log("Contract deployed at:", this.contractInstance.address);
    
    $("#contractAddress").html("Contract Address: " + this.contractInstance.address);
    $("#debugInfo").html("Status: Connected to blockchain");
  },

  /**
   * Load initial data
   */
  async loadInitialData() {
    await this.loadActiveElections();
    this.startLiveTallyUpdate();
  },

  /**
   * Display network information
   */
  async displayNetworkInfo() {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    const networkMap = {
      "0x1": "Ethereum Mainnet",
      "0x3": "Ropsten Testnet",
      "0x4": "Rinkeby Testnet",
      "0x5": "Goerli Testnet",
      "0x539": "Ganache Local"
    };
    
    const networkName = networkMap[chainId] || `Local Network (${chainId})`;
    $("#networkInfo").html("Network: " + networkName);
    document.title = "Decentralized Voting System - Admin Portal";
  },

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    this.setupCandidateManagement();
    this.setupElectionCreation();
    this.setupRefreshButton();
  },

  /**
   * Setup candidate add/remove functionality
   */
  setupCandidateManagement() {
    $("#addMoreCandidates").click(() => {
      this.candidateCounter++;
      const newCandidateRow = this.createCandidateHTML(this.candidateCounter);
      $("#additionalCandidates").append(newCandidateRow);
    });

    $("#additionalCandidates").on("click", ".remove-candidate", (e) => {
      const candidateId = $(e.target).data("id");
      $(`#candidate-${candidateId}`).remove();
    });
  },

  /**
   * Create HTML for a new candidate entry
   */
  createCandidateHTML(id) {
    return `
      <div class="candidate-entry" id="candidate-${id}">
        <table class="table text-center">
          <tr>
            <th>Name</th>
            <td><input type="text" name="name-${id}" id="name-${id}" placeholder="Candidate's name" required></td>
            <th>Party/Position</th>
            <td>
              <div style="display: flex; align-items: center;">
                <input type="text" name="party-${id}" id="party-${id}" placeholder="Party or Position" required>
                <button type="button" class="remove-candidate" data-id="${id}">✕</button>
              </div>
            </td>
          </tr>
        </table>
      </div>
    `;
  },

  /**
   * Setup election creation form
   */
  setupElectionCreation() {
    $("#createElection").click(async (e) => {
      e.preventDefault();
      await this.createElection();
    });
  },

  /**
   * Setup refresh button
   */
  setupRefreshButton() {
    $("#refreshElections").click(async () => {
      await this.loadActiveElections();
    });
  },

  /**
   * Create a new election
   */
  async createElection() {
    this.setStatus("Processing your request...", "var(--accent-color)");
    $("#createElection").prop("disabled", true);

    try {
      const formData = this.getFormData();
      
      if (!this.validateFormData(formData)) {
        return;
      }

      await this.createElectionOnBlockchain(formData);
      await this.addCandidatesToElection(formData.electionId, formData.candidates);
      
      this.setStatus(`Success! Election "${formData.electionName}" created with ${formData.candidates.length} candidates!`, "green");
      this.resetForm();
      
      await this.loadActiveElections();
      this.startLiveTallyUpdate();

    } catch (error) {
      this.handleError("Error creating election", error);
    } finally {
      $("#createElection").prop("disabled", false);
    }
  },

  /**
   * Get form data
   */
  getFormData() {
    const electionName = $("#electionName").val();
    const startDate = this.parseDateTime('start');
    const endDate = this.parseDateTime('end');
    const candidates = this.collectCandidates();

    return {
      electionName,
      startDate: Math.floor(startDate.getTime() / 1000),
      endDate: Math.floor(endDate.getTime() / 1000),
      candidates
    };
  },

  /**
   * Parse date and time from form inputs
   */
  parseDateTime(prefix) {
    const day = parseInt($(`#${prefix}DateDay`).val());
    const month = parseInt($(`#${prefix}DateMonth`).val());
    const year = parseInt($(`#${prefix}DateYear`).val());
    const hour = parseInt($(`#${prefix}DateHour`).val());
    const minute = parseInt($(`#${prefix}DateMinute`).val());

    return new Date(year, month - 1, day, hour, minute);
  },

  /**
   * Collect all candidates from form
   */
  collectCandidates() {
    const candidates = [];
    
    for (let i = 1; i <= this.candidateCounter; i++) {
      const candidateElement = $(`#candidate-${i}`);
      if (candidateElement.length) {
        const name = $(`#name-${i}`).val();
        const party = $(`#party-${i}`).val();
        
        if (name && party) {
          candidates.push({ name, party });
        }
      }
    }
    
    return candidates;
  },

  /**
   * Validate form data
   */
  validateFormData(formData) {
    const now = Math.floor(Date.now() / 1000);

    if (formData.startDate < now) {
      this.setStatus("Start date must be in the future", "red");
      return false;
    }

    if (formData.endDate <= formData.startDate) {
      this.setStatus("End date must be after start date", "red");
      return false;
    }

    if (formData.candidates.length < 2) {
      this.setStatus("Please add at least two candidates for the election", "red");
      return false;
    }

    return true;
  },

  /**
   * Create election on blockchain
   */
  async createElectionOnBlockchain(formData) {
    this.setStatus(`Creating election "${formData.electionName}"...`, "var(--accent-color)");
    
    const result = await this.contractInstance.createElection(
      formData.electionName,
      formData.startDate,
      formData.endDate
    );
    
    const electionId = result.logs[0].args.electionId.toNumber();
    formData.electionId = electionId;
    
    console.log("Election created:", result);
    this.setStatus(`Election "${formData.electionName}" created with ID: ${electionId}. Adding candidates...`, "var(--accent-color)");
  },

  /**
   * Add candidates to election
   */
  async addCandidatesToElection(electionId, candidates) {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      this.setStatus(`Adding candidate ${i+1}/${candidates.length}: ${candidate.name}...`, "var(--accent-color)");
      await this.contractInstance.addCandidate(electionId, candidate.name, candidate.party);
    }
  },

  /**
   * Reset the form
   */
  resetForm() {
    $("#electionForm")[0].reset();
    $("#additionalCandidates").empty();
    this.candidateCounter = 1;
  },

  /**
   * Load active elections from blockchain
   */
  async loadActiveElections() {
    try {
      const electionCount = await this.contractInstance.getElectionCount();
      console.log("Total elections:", electionCount.toNumber());

      if (electionCount.toNumber() === 0) {
        $("#activeElections").html("<p>No elections found. Create your first election above.</p>");
        return;
      }

      const electionsHTML = await this.buildElectionsTable(electionCount.toNumber());
      $("#activeElections").html(electionsHTML);

    } catch (error) {
      this.handleError("Error loading elections", error);
      $("#activeElections").html(`<p style='color:red'>Error loading elections: ${error.message}</p>`);
    }
  },

  /**
   * Build elections table HTML
   */
  async buildElectionsTable(count) {
    let html = `
      <table class="elections-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Status</th>
            <th>Candidates</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    const now = Math.floor(Date.now() / 1000);
    let hasActiveElection = false;

    for (let i = 1; i <= count; i++) {
      const election = await this.contractInstance.getElection(i);
      const row = this.buildElectionRow(election, now);
      html += row.html;
      
      if (row.isActive) {
        hasActiveElection = true;
        await this.updateLiveTally(i);
      }
    }

    html += `</tbody></table>`;

    if (!hasActiveElection) {
      $("#tallyMessage").show();
      $("#tallyCards").hide();
    }

    return html;
  },

  /**
   * Build single election row HTML
   */
  buildElectionRow(election, now) {
    const id = election[0].toNumber();
    const name = election[1];
    const startTime = election[2].toNumber();
    const endTime = election[3].toNumber();
    const candidateCount = election[4].toNumber();

    const { status, statusClass } = this.getElectionStatus(startTime, endTime, now);

    const html = `
      <tr>
        <td>${id}</td>
        <td>${name}</td>
        <td>${new Date(startTime * 1000).toLocaleString()}</td>
        <td>${new Date(endTime * 1000).toLocaleString()}</td>
        <td><span class="${statusClass}">${status}</span></td>
        <td>${candidateCount}</td>
        <td>
          <button class="btn-view" onclick="AdminApp.viewElectionResults(AdminApp.contractInstance, ${id})">View Results</button>
          ${status === "Active" ? `<button class="btn-live" onclick="AdminApp.updateLiveTally(AdminApp.contractInstance, ${id})">Live Tally</button>` : ''}
        </td>
      </tr>
    `;

    return {
      html,
      isActive: status === "Active"
    };
  },

  /**
   * Get election status
   */
  getElectionStatus(startTime, endTime, now) {
    let status = "Upcoming";
    let statusClass = "status-upcoming";

    if (now >= startTime && now < endTime) {
      status = "Active";
      statusClass = "status-active";
    } else if (now >= endTime) {
      status = "Ended";
      statusClass = "status-ended";
    }

    return { status, statusClass };
  },

  /**
   * Start live tally update interval
   */
  startLiveTallyUpdate() {
    if (this.tallyInterval) {
      clearInterval(this.tallyInterval);
    }

    this.tallyInterval = setInterval(async () => {
      try {
        const electionCount = await this.contractInstance.getElectionCount();
        const now = Math.floor(Date.now() / 1000);

        for (let i = 1; i <= electionCount.toNumber(); i++) {
          const election = await this.contractInstance.getElection(i);
          const startTime = election[2].toNumber();
          const endTime = election[3].toNumber();

          if (now >= startTime && now < endTime) {
            await this.updateLiveTally(i);
          }
        }
      } catch (error) {
        console.error("Error updating live tally:", error);
      }
    }, 10000);
  },

  /**
   * Update live tally for an election
   */
  async updateLiveTally(electionIdOrInstance, electionId) {
    const instance = typeof electionIdOrInstance === 'number' 
      ? this.contractInstance 
      : electionIdOrInstance;
    const id = typeof electionIdOrInstance === 'number' 
      ? electionIdOrInstance 
      : electionId;

    try {
      const election = await instance.getElection(id);
      const name = election[1];
      const candidateCount = election[4].toNumber();

      if (candidateCount === 0) {
        $("#tallyMessage").text("No candidates found for this election").show();
        $("#tallyCards").hide();
        return;
      }

      const { candidates, totalVotes } = await this.getCandidatesData(instance, id, candidateCount);
      this.displayTallyResults(name, candidates, totalVotes);

    } catch (error) {
      console.error("Error updating live tally:", error);
      $("#tallyMessage").text(`Error updating tally: ${error.message}`).show();
      $("#tallyCards").hide();
    }
  },

  /**
   * Get candidates data for an election
   */
  async getCandidatesData(instance, electionId, candidateCount) {
    const candidates = [];
    let totalVotes = 0;

    for (let i = 1; i <= candidateCount; i++) {
      const candidate = await instance.getCandidate(electionId, i);
      const candidateData = {
        id: candidate[0].toNumber(),
        name: candidate[1],
        party: candidate[2],
        votes: candidate[3].toNumber()
      };
      
      totalVotes += candidateData.votes;
      candidates.push(candidateData);
    }

    candidates.sort((a, b) => b.votes - a.votes);
    return { candidates, totalVotes };
  },

  /**
   * Display tally results
   */
  displayTallyResults(electionName, candidates, totalVotes) {
    $("#tallyMessage").hide();
    $("#tallyCards").show();

    let html = `<h4 class="tally-title">Live Results: ${electionName}</h4>`;

    candidates.forEach(candidate => {
      const percentage = totalVotes > 0 
        ? ((candidate.votes / totalVotes) * 100).toFixed(1) 
        : 0;

      html += `
        <div class="tally-card">
          <h4>${candidate.name}</h4>
          <div class="party">${candidate.party}</div>
          <div class="votes">${candidate.votes}</div>
          <div class="percentage">${percentage}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    });

    $("#tallyCards").html(html);
  },

  /**
   * View election results
   */
  async viewElectionResults(instance, electionId) {
    try {
      const election = await instance.getElection(electionId);
      const name = election[1];
      const startTime = election[2].toNumber();
      const endTime = election[3].toNumber();
      const candidateCount = election[4].toNumber();

      const resultsHTML = await this.buildResultsHTML(
        instance,
        electionId,
        name,
        startTime,
        endTime,
        candidateCount
      );

      $("#activeElections").html(resultsHTML);

    } catch (error) {
      this.handleError("Error viewing election results", error);
      $("#activeElections").html(`<p style='color:red'>Error viewing results: ${error.message}</p>`);
    }
  },

  /**
   * Build results HTML
   */
  async buildResultsHTML(instance, electionId, name, startTime, endTime, candidateCount) {
    let html = `
      <h3>Results for "${name}"</h3>
      <p>Election period: ${new Date(startTime * 1000).toLocaleString()} - ${new Date(endTime * 1000).toLocaleString()}</p>
      <table class="elections-table">
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

    for (let i = 1; i <= candidateCount; i++) {
      const candidate = await instance.getCandidate(electionId, i);
      const votes = candidate[3].toNumber();
      totalVotes += votes;

      html += `
        <tr>
          <td>${candidate[0].toNumber()}</td>
          <td>${candidate[1]}</td>
          <td>${candidate[2]}</td>
          <td>${votes}</td>
        </tr>
      `;
    }

    html += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total Votes:</td>
            <td>${totalVotes}</td>
          </tr>
        </tfoot>
      </table>
      <button class="btn-secondary" onclick="AdminApp.loadActiveElections()">Back to Elections</button>
    `;

    return html;
  },

  /**
   * Set status message
   */
  setStatus(message, color) {
    $("#electionStatus").html(`<span style='color:${color}'>${message}</span>`);
  },

  /**
   * Handle errors
   */
  handleError(context, error) {
    console.error(`${context}:`, error);
    $("#debugInfo").html(`Status: ${context} - ${error.message}`);
    this.setStatus(`Error: ${error.message}`, "red");
  }
};

/**
 * Event Listeners for Metamask
 */
if (window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    console.log('Account changed to:', accounts[0]);
    $('#accountAddress').html("Your Account: " + accounts[0]);
    $('#debugInfo').html("Status: Account changed. Refreshing page...");
    setTimeout(() => window.location.reload(), 1000);
  });

  window.ethereum.on('chainChanged', (chainId) => {
    console.log('Network changed to:', chainId);
    $('#debugInfo').html("Status: Network changed. Refreshing page...");
    window.location.reload();
  });
}

/**
 * Initialize on window load
 */
window.addEventListener("load", () => {
  if (typeof web3 !== "undefined") {
    console.warn("Using web3 detected from external source like Metamask");
    window.eth = new Web3(window.ethereum);
  } else {
    console.warn("No web3 detected. Falling back to http://localhost:9545");
    window.eth = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:9545"));
  }
  
  window.AdminApp.init();
});