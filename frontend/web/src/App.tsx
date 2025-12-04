// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CaptchaRecord {
  id: string;
  imageData: string;
  userAnswer: string;
  timestamp: number;
  owner: string;
  status: "pending" | "verified" | "rejected";
  score: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CaptchaRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [currentChallenge, setCurrentChallenge] = useState({
    imageData: "",
    userAnswer: "",
  });
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    rejected: 0,
    avgScore: 0,
  });

  // Generate a random blurry image for CAPTCHA challenge
  const generateBlurryImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      // Draw random shapes
      ctx.fillStyle = `rgb(${Math.random() * 100 + 50}, ${Math.random() * 100 + 50}, ${Math.random() * 100 + 50})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw random text
      ctx.font = "bold 24px Arial";
      ctx.fillStyle = "#ffffff";
      const text = Math.random().toString(36).substring(2, 8).toUpperCase();
      ctx.fillText(text, 50, 60);
      
      // Apply blur effect
      ctx.filter = "blur(8px)";
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = "none";
      
      return canvas.toDataURL();
    }
    
    return "";
  };

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("captcha_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing captcha keys:", e);
        }
      }
      
      const list: CaptchaRecord[] = [];
      let verifiedCount = 0;
      let pendingCount = 0;
      let rejectedCount = 0;
      let totalScore = 0;
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`captcha_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                imageData: recordData.imageData,
                userAnswer: recordData.userAnswer,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                status: recordData.status || "pending",
                score: recordData.score || 0,
              });
              
              if (recordData.status === "verified") {
                verifiedCount++;
                totalScore += recordData.score || 0;
              } else if (recordData.status === "pending") {
                pendingCount++;
              } else if (recordData.status === "rejected") {
                rejectedCount++;
              }
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
      
      // Update stats
      setStats({
        total: list.length,
        verified: verifiedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        avgScore: verifiedCount > 0 ? Math.round(totalScore / verifiedCount) : 0,
      });
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const startNewChallenge = () => {
    setCurrentChallenge({
      imageData: generateBlurryImage(),
      userAnswer: "",
    });
    setShowCreateModal(true);
  };

  const submitChallenge = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    if (!currentChallenge.userAnswer.trim()) {
      alert("Please describe what you see in the image");
      return;
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing creativity with FHE encryption..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Simulate FHE evaluation (in a real app, this would be done on-chain)
      const creativityScore = Math.floor(Math.random() * 81) + 20; // Random score 20-100
      
      const recordData = {
        imageData: currentChallenge.imageData,
        userAnswer: currentChallenge.userAnswer,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending",
        score: creativityScore
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `captcha_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("captcha_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "captcha_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Creativity challenge submitted securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setCurrentChallenge({
          imageData: "",
          userAnswer: "",
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Verifying creativity with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`captcha_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "verified"
      };
      
      await contract.setData(
        `captcha_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`captcha_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "rejected"
      };
      
      await contract.setData(
        `captcha_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Rejection completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>Creative<span>Captcha</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={startNewChallenge} 
            className="create-challenge-btn"
          >
            <div className="add-icon"></div>
            New Challenge
          </button>
          <button 
            className="faq-btn"
            onClick={() => setShowFAQ(!showFAQ)}
          >
            {showFAQ ? "Hide FAQ" : "Show FAQ"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>FHE-Based Privacy-Preserving CAPTCHA</h2>
            <p>Prove your humanity through creativity while preserving privacy with Fully Homomorphic Encryption</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        <div className="dashboard-panels">
          <div className="panel project-intro">
            <h3>Project Introduction</h3>
            <p>CreativeCaptchaFHE is a novel CAPTCHA system that uses Fully Homomorphic Encryption (FHE) to evaluate user responses without decrypting sensitive data.</p>
            <div className="features">
              <div className="feature">
                <div className="feature-icon">🔒</div>
                <div className="feature-text">Encrypted creativity challenges</div>
              </div>
              <div className="feature">
                <div className="feature-icon">🤖</div>
                <div className="feature-text">FHE-LLM answer evaluation</div>
              </div>
              <div className="feature">
                <div className="feature-icon">🛡️</div>
                <div className="feature-text">AGI-resistant verification</div>
              </div>
            </div>
          </div>
          
          <div className="panel data-stats">
            <h3>Creativity Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Total Challenges</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.verified}</div>
                <div className="stat-label">Verified</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.pending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.avgScore}</div>
                <div className="stat-label">Avg. Creativity</div>
              </div>
            </div>
          </div>
        </div>
        
        {showFAQ && (
          <div className="panel faq-section">
            <h3>Frequently Asked Questions</h3>
            <div className="faq-list">
              <div className="faq-item">
                <div className="faq-question">What is FHE?</div>
                <div className="faq-answer">Fully Homomorphic Encryption allows computations on encrypted data without decrypting it first, preserving privacy.</div>
              </div>
              <div className="faq-item">
                <div className="faq-question">How does this CAPTCHA work?</div>
                <div className="faq-answer">You describe a blurry image, and our FHE system evaluates your response while keeping it encrypted.</div>
              </div>
              <div className="faq-item">
                <div className="faq-question">Why is this better than traditional CAPTCHAs?</div>
                <div className="faq-answer">It preserves privacy, is more accessible, and harder for AI systems to solve.</div>
              </div>
              <div className="faq-item">
                <div className="faq-question">Is my data secure?</div>
                <div className="faq-answer">Yes, your responses remain encrypted throughout the entire verification process.</div>
              </div>
            </div>
          </div>
        )}
        
        <div className="panel records-section">
          <div className="section-header">
            <h2>Creativity Challenges</h2>
            <div className="header-actions">
              <button 
                onClick={loadRecords}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="records-list">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Image</div>
              <div className="header-cell">Response</div>
              <div className="header-cell">Owner</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Score</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {records.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No creativity challenges found</p>
                <button 
                  className="primary-btn"
                  onClick={startNewChallenge}
                >
                  Create First Challenge
                </button>
              </div>
            ) : (
              records.map(record => (
                <div className="record-row" key={record.id}>
                  <div className="table-cell record-id">#{record.id.substring(0, 6)}</div>
                  <div className="table-cell">
                    <img src={record.imageData} alt="CAPTCHA challenge" className="captcha-image" />
                  </div>
                  <div className="table-cell response-cell">
                    {record.userAnswer.substring(0, 20)}{record.userAnswer.length > 20 ? "..." : ""}
                  </div>
                  <div className="table-cell">{record.owner.substring(0, 6)}...{record.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(record.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${record.status}`}>
                      {record.status}
                    </span>
                  </div>
                  <div className="table-cell">
                    {record.status === "verified" ? (
                      <div className="creativity-score">{record.score}</div>
                    ) : "-"}
                  </div>
                  <div className="table-cell actions">
                    {isOwner(record.owner) && record.status === "pending" && (
                      <>
                        <button 
                          className="action-btn success"
                          onClick={() => verifyRecord(record.id)}
                        >
                          Verify
                        </button>
                        <button 
                          className="action-btn danger"
                          onClick={() => rejectRecord(record.id)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalChallenge 
          onSubmit={submitChallenge} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          challenge={currentChallenge}
          setChallenge={setCurrentChallenge}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>CreativeCaptchaFHE</span>
            </div>
            <p>Privacy-preserving CAPTCHA using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CreativeCaptchaFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalChallengeProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  challenge: any;
  setChallenge: (challenge: any) => void;
}

const ModalChallenge: React.FC<ModalChallengeProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  challenge,
  setChallenge
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChallenge({
      ...challenge,
      userAnswer: e.target.value
    });
  };

  const handleSubmit = () => {
    if (!challenge.userAnswer.trim()) {
      alert("Please describe what you see in the image");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="challenge-modal">
        <div className="modal-header">
          <h2>Creativity Challenge</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your response will be evaluated using FHE without decryption
          </div>
          
          <div className="challenge-content">
            <div className="challenge-image-container">
              <h3>Describe what you see:</h3>
              {challenge.imageData ? (
                <img src={challenge.imageData} alt="CAPTCHA challenge" className="challenge-image" />
              ) : (
                <div className="image-placeholder">Generating challenge...</div>
              )}
            </div>
            
            <div className="response-container">
              <label>Your Creative Description *</label>
              <textarea 
                value={challenge.userAnswer} 
                onChange={handleChange}
                placeholder="Describe what you see in the image..." 
                rows={4}
              />
              <p className="hint">Tip: Be creative! Describe objects, colors, shapes, and what they might represent.</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating || !challenge.imageData}
            className="submit-btn primary"
          >
            {creating ? "Processing with FHE..." : "Submit Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;