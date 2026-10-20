// =====================================================
// ĐẤTCHAIN - Quản lý quyền sử dụng đất
// ethers.js v5.7.2 - Ethereum Sepolia
// =====================================================

const CONTRACT_ADDRESS = "0x28428b974E80c7C9267adf914C02bAA76D1E5AB2";
const SEPOLIA_CHAIN_ID = "0xaa36a7";
const SEPOLIA_RPC = "https://sepolia.infura.io/v3/1a9553d4833a4542871fc2c240094786";

const CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType":"uint256","name":"maSo","type":"uint256"},
            {"internalType":"uint256","name":"dienTich","type":"uint256"},
            {"internalType":"address","name":"chuDauTien","type":"address"}
        ],
        "name":"dangKyThuaDat",
        "outputs":[],
        "stateMutability":"nonpayable",
        "type":"function"
    },
    {
        "inputs":[
            {"internalType":"uint256","name":"maSo","type":"uint256"},
            {"internalType":"address","name":"chuMoi","type":"address"}
        ],
        "name":"chuyenNhuong",
        "outputs":[],
        "stateMutability":"nonpayable",
        "type":"function"
    },
    {
        "inputs":[{"internalType":"uint256","name":"maSo","type":"uint256"}],
        "name":"xemChuSoHuu",
        "outputs":[{"internalType":"address","name":"","type":"address"}],
        "stateMutability":"view",
        "type":"function"
    },
    {
        "inputs":[{"internalType":"uint256","name":"maSo","type":"uint256"}],
        "name":"xemDienTich",
        "outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
        "stateMutability":"view",
        "type":"function"
    },
    {
        "inputs":[{"internalType":"uint256","name":"maSo","type":"uint256"}],
        "name":"xemLichSuChuyenNhuong",
        "outputs":[{
            "components":[
                {"internalType":"address","name":"chuCu","type":"address"},
                {"internalType":"address","name":"chuMoi","type":"address"},
                {"internalType":"uint256","name":"thoiGian","type":"uint256"}
            ],
            "internalType":"struct QuanLyDatDai.ChuyenNhuong[]",
            "name":"",
            "type":"tuple[]"
        }],
        "stateMutability":"view",
        "type":"function"
    }
];

let readProvider;
let readContract;
let walletProvider;
let signer;
let writeContract;
let successfulTransactions = 0;

const $ = (id) => document.getElementById(id);

function showMessage(message, type = "info") {
    const box = $("appMessage");
    if (!box) return;
    box.textContent = message;
    box.className = `app-message ${type}`;
    box.style.display = "block";
}

function setFormBusy(form, busy, busyText = "Đang xử lý...") {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (busy) {
        button.dataset.originalText = button.textContent;
        button.textContent = busyText;
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}

function parsePositiveInteger(value, label) {
    const trimmed = String(value).trim();
    if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed)) || Number(trimmed) <= 0) {
        throw new Error(`${label} phải là số nguyên lớn hơn 0.`);
    }
    return trimmed;
}

function validateAddress(value, label) {
    const address = String(value).trim();
    if (!ethers.utils.isAddress(address)) {
        throw new Error(`${label} không đúng định dạng địa chỉ Ethereum.`);
    }
    if (address.toLowerCase() === "0x0000000000000000000000000000000000000000") {
        throw new Error(`${label} không được là địa chỉ 0x000...000.`);
    }
    return ethers.utils.getAddress(address);
}

function friendlyError(error) {
    if (!error) return "Đã xảy ra lỗi không xác định.";
    if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        return "Bạn đã từ chối giao dịch trong MetaMask.";
    }

    const raw = error.reason ||
        error.data?.message ||
        error.error?.message ||
        error.message ||
        "Đã xảy ra lỗi không xác định.";

    if (/Thua dat da ton tai/i.test(raw)) return "Mã thửa đất này đã được đăng ký.";
    if (/Thua dat khong ton tai/i.test(raw)) return "Không tồn tại thửa đất có mã này.";
    if (/Ban khong phai chu so huu/i.test(raw)) return "Giao dịch bị từ chối: ví hiện tại không phải chủ sở hữu.";
    if (/Dien tich phai lon hon 0/i.test(raw)) return "Diện tích phải lớn hơn 0.";
    if (/insufficient funds/i.test(raw)) return "Ví không đủ Sepolia ETH để trả phí gas.";
    if (/network|chain/i.test(raw) && /wrong|unsupported|switch/i.test(raw)) {
        return "Vui lòng chuyển MetaMask sang mạng Sepolia.";
    }
    return raw;
}

function getReadContract() {
    if (!readProvider) {
        readProvider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
        readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
    }
    return readContract;
}

async function connectWallet() {
    if (!window.ethereum) {
        throw new Error("Chưa phát hiện MetaMask. Hãy cài đặt hoặc mở rộng ví MetaMask.");
    }
    if (typeof ethers === "undefined") {
        throw new Error("Không tải được thư viện ethers.js. Hãy kiểm tra kết nối mạng và tải lại trang.");
    }

    walletProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await walletProvider.send("eth_requestAccounts", []);

    const network = await walletProvider.getNetwork();
    if (network.chainId !== 11155111) {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: SEPOLIA_CHAIN_ID }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                throw new Error("MetaMask chưa có mạng Sepolia. Hãy thêm mạng Sepolia vào MetaMask rồi thử lại.");
            }
            throw new Error("Hãy chuyển MetaMask sang Ethereum Sepolia Test Network.");
        }
    }

    // Làm mới provider sau khi đổi mạng.
    walletProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = walletProvider.getSigner();
    writeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const account = await signer.getAddress();
    $("networkStatus").textContent = "Đã kết nối Sepolia";
    $("totalLand").textContent = "Đã kết nối";
    $("connectWallet").textContent = `${account.slice(0, 6)}...${account.slice(-4)}`;
    showMessage(`Đã kết nối MetaMask: ${account}`, "success");
    return writeContract;
}

async function ensureWriteContract() {
    if (!window.ethereum) {
        throw new Error("Chưa phát hiện MetaMask. Hãy cài đặt hoặc mở ví MetaMask.");
    }

    if (!writeContract) {
        await connectWallet();
    }

    const network = await walletProvider.getNetwork();
    if (network.chainId !== 11155111) {
        writeContract = null;
        throw new Error("MetaMask đang ở sai mạng. Vui lòng chọn Sepolia Test Network.");
    }
    return writeContract;
}

async function searchLand(maSo) {
    const read = getReadContract();
    const [owner, area, history] = await Promise.all([
        read.xemChuSoHuu(maSo),
        read.xemDienTich(maSo),
        read.xemLichSuChuyenNhuong(maSo)
    ]);

    const historyItems = history.length === 0
        ? "<li>Chưa có lịch sử chuyển nhượng.</li>"
        : history.map((item) => {
            const timestamp = Number(item.thoiGian.toString());
            const date = new Date(timestamp * 1000).toLocaleString("vi-VN");
            return `<li><strong>Từ:</strong> <code>${item.chuCu}</code><br>
                    <strong>Đến:</strong> <code>${item.chuMoi}</code><br>
                    <strong>Thời gian:</strong> ${date}</li>`;
        }).join("");

    $("landInfo").innerHTML = `
        <strong>Thông tin thửa đất số ${maSo}</strong>
        <p><strong>Diện tích:</strong> ${area.toString()} m²</p>
        <p><strong>Chủ sở hữu hiện tại:</strong><br><code>${owner}</code></p>
        <p><strong>Lịch sử chuyển nhượng:</strong></p>
        <ul>${historyItems}</ul>
        <p><a href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}" target="_blank" rel="noopener noreferrer">Xem smart contract trên Etherscan ↗</a></p>
    `;
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("ĐẤTCHAIN: script.js đã được tải.");

    if (typeof ethers === "undefined") {
        showMessage("Không tải được ethers.js. Kiểm tra kết nối mạng hoặc thư viện CDN.", "error");
        return;
    }

    $("connectWallet").addEventListener("click", async () => {
        try {
            await connectWallet();
        } catch (error) {
            showMessage(friendlyError(error), "error");
        }
    });

    $("searchForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setFormBusy(form, true, "Đang tra cứu...");
        const maSo = $("searchId").value.trim();

        try {
            parsePositiveInteger(maSo, "Mã số thửa đất");
            $("landInfo").textContent = "Đang truy vấn dữ liệu trên Sepolia...";
            await searchLand(maSo);
            showMessage("Tra cứu thành công.", "success");
        } catch (error) {
            $("landInfo").textContent = `Không thể tra cứu: ${friendlyError(error)}`;
            showMessage(friendlyError(error), "error");
        } finally {
            setFormBusy(form, false);
        }
    });

    $("registerForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        console.log("Đã chạy sự kiện đăng ký thửa đất.");
        const form = event.currentTarget;
        setFormBusy(form, true, "Đang xử lý...");

        try {
            const maSo = parsePositiveInteger($("landId").value, "Mã số thửa đất");
            const dienTich = parsePositiveInteger($("area").value, "Diện tích");
            const chuDauTien = validateAddress($("firstOwner").value, "Địa chỉ ví chủ đầu tiên");
            const contract = await ensureWriteContract();

            showMessage("Hãy kiểm tra và xác nhận giao dịch đăng ký trong MetaMask.", "info");
            const tx = await contract.dangKyThuaDat(maSo, dienTich, chuDauTien);
            showMessage(`Đã gửi giao dịch. Đang chờ xác nhận: ${tx.hash}`, "info");
            await tx.wait();

            successfulTransactions += 1;
            $("totalTransfer").textContent = String(successfulTransactions);
            showMessage(`Đăng ký thửa đất ${maSo} thành công! TxHash: ${tx.hash}`, "success");
            await searchLand(maSo);
            form.reset();
        } catch (error) {
            showMessage(`Đăng ký thất bại: ${friendlyError(error)}`, "error");
        } finally {
            setFormBusy(form, false);
        }
    });

    $("transferForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        console.log("Đã chạy sự kiện chuyển nhượng.");
        const form = event.currentTarget;
        setFormBusy(form, true, "Đang xử lý...");

        try {
            const maSo = parsePositiveInteger($("transferId").value, "Mã số thửa đất");
            const chuMoi = validateAddress($("newOwner").value, "Ví chủ sở hữu mới");
            const contract = await ensureWriteContract();
            const currentAccount = await signer.getAddress();
            const owner = await contract.xemChuSoHuu(maSo);

            if (owner.toLowerCase() !== currentAccount.toLowerCase()) {
                throw new Error(`Ví MetaMask đang kết nối (${currentAccount}) không phải chủ sở hữu hiện tại (${owner}).`);
            }

            showMessage("Hãy xác nhận giao dịch chuyển nhượng trong MetaMask.", "info");
            const tx = await contract.chuyenNhuong(maSo, chuMoi);
            showMessage(`Đã gửi giao dịch. Đang chờ xác nhận: ${tx.hash}`, "info");
            await tx.wait();

            successfulTransactions += 1;
            $("totalTransfer").textContent = String(successfulTransactions);
            showMessage(`Chuyển nhượng thửa đất ${maSo} thành công! TxHash: ${tx.hash}`, "success");
            await searchLand(maSo);
            form.reset();
        } catch (error) {
            showMessage(`Chuyển nhượng thất bại: ${friendlyError(error)}`, "error");
        } finally {
            setFormBusy(form, false);
        }
    });

    if (window.ethereum) {
        window.ethereum.on?.("accountsChanged", () => {
            writeContract = null;
            signer = null;
            $("networkStatus").textContent = "Ví đã thay đổi";
            $("totalLand").textContent = "Chưa kết nối";
            $("connectWallet").textContent = "Kết nối MetaMask";
        });
        window.ethereum.on?.("chainChanged", () => window.location.reload());
    }
});
