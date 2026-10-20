
 // =====================================================
 // ĐẤTCHAIN - Quản lý quyền sử dụng đất
 // ethers.js v5.7.2 - Ethereum Sepolia
 // =====================================================

const CONTRACT_ADDRESS = "0xA6fB0E4481a7EAe7D0A7E9D9d14951657031AAD9";
const SEPOLIA_CHAIN_ID = "0xaa36a7";

// RPC chính và các RPC dự phòng
const SEPOLIA_RPCS = [
    "https://sepolia.infura.io/v3/1a9553d4833a4542871fc2c240094786",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://sepolia.drpc.org"
];

// ABI của Smart Contract QuanLyDatDai
const CONTRACT_ABI = [
    {
        inputs: [
            { internalType: "uint256", name: "maSo", type: "uint256" },
            { internalType: "uint256", name: "dienTich", type: "uint256" },
            { internalType: "address", name: "chuDauTien", type: "address" }
        ],
        name: "dangKyThuaDat",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "maSo", type: "uint256" },
            { internalType: "address", name: "chuMoi", type: "address" }
        ],
        name: "chuyenNhuong",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "maSo", type: "uint256" }
        ],
        name: "xemChuSoHuu",
        outputs: [
            { internalType: "address", name: "", type: "address" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "maSo", type: "uint256" }
        ],
        name: "xemDienTich",
        outputs: [
            { internalType: "uint256", name: "", type: "uint256" }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            { internalType: "uint256", name: "maSo", type: "uint256" }
        ],
        name: "xemLichSuChuyenNhuong",
        outputs: [
            {
                components: [
                    { internalType: "address", name: "chuCu", type: "address" },
                    { internalType: "address", name: "chuMoi", type: "address" },
                    { internalType: "uint256", name: "thoiGian", type: "uint256" }
                ],
                internalType: "struct QuanLyDatDai.ChuyenNhuong[]",
                name: "",
                type: "tuple[]"
            }
        ],
        stateMutability: "view",
        type: "function"
    }
];

// =====================================================
// 1. KHAI BÁO BIẾN
// =====================================================

let readProvider = null;
let readContract = null;

let walletProvider = null;
let signer = null;
let writeContract = null;

let successfulTransactions = 0;

const $ = (id) => document.getElementById(id);

// =====================================================
// 2. HIỂN THỊ THÔNG BÁO
// =====================================================

function showMessage(message, type = "info") {
    const box = $("appMessage");

    if (!box) {
        console.log(message);
        return;
    }

    box.textContent = message;
    box.className = `app-message ${type}`;
    box.style.display = "block";
}

// =====================================================
// 3. KHÓA NÚT KHI ĐANG XỬ LÝ
// =====================================================

function setFormBusy(form, busy, busyText = "Đang xử lý...") {
    const button = form.querySelector('button[type="submit"]');

    if (!button) return;

    if (busy) {
        button.dataset.originalText = button.textContent;
        button.textContent = busyText;
        button.disabled = true;
    } else {
        button.textContent =
            button.dataset.originalText || button.textContent;

        button.disabled = false;
    }
}

// =====================================================
// 4. KIỂM TRA DỮ LIỆU ĐẦU VÀO
// =====================================================

function parsePositiveInteger(value, label) {
    const trimmed = String(value).trim();

    if (
        !/^\d+$/.test(trimmed) ||
        !Number.isSafeInteger(Number(trimmed)) ||
        Number(trimmed) <= 0
    ) {
        throw new Error(`${label} phải là số nguyên lớn hơn 0.`);
    }

    return trimmed;
}

function validateAddress(value, label) {
    const address = String(value).trim();

    if (!ethers.utils.isAddress(address)) {
        throw new Error(
            `${label} không đúng định dạng địa chỉ Ethereum.`
        );
    }

    if (
        address.toLowerCase() ===
        "0x0000000000000000000000000000000000000000"
    ) {
        throw new Error(
            `${label} không được là địa chỉ ví 0x000...000.`
        );
    }

    return ethers.utils.getAddress(address);
}

// =====================================================
// 5. CHUYỂN LỖI THÀNH THÔNG BÁO DỄ HIỂU
// =====================================================

function friendlyError(error) {
    if (!error) {
        return "Đã xảy ra lỗi không xác định.";
    }

    if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        return "Bạn đã từ chối giao dịch trong MetaMask.";
    }

    const raw =
        error.reason ||
        error.data?.message ||
        error.error?.message ||
        error.message ||
        "Đã xảy ra lỗi không xác định.";

    if (/Thua dat da ton tai/i.test(raw)) {
        return "Mã thửa đất này đã được đăng ký.";
    }

    if (/Thua dat khong ton tai/i.test(raw)) {
        return "Không tồn tại thửa đất có mã này.";
    }

    if (/Ban khong phai chu so huu/i.test(raw)) {
        return "Ví hiện tại không phải chủ sở hữu thửa đất.";
    }

    if (/Dien tich phai lon hon 0/i.test(raw)) {
        return "Diện tích phải lớn hơn 0.";
    }

    if (/insufficient funds/i.test(raw)) {
        return "Ví không đủ Sepolia ETH để trả phí gas.";
    }

    if (/Không tìm thấy mã hợp đồng/i.test(raw)) {
        return raw;
    }

    if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) {
        return "Không kết nối được RPC. Hãy kiểm tra mạng Internet hoặc RPC.";
    }

    if (/network|chain/i.test(raw) && /wrong|unsupported|switch/i.test(raw)) {
        return "Vui lòng chuyển MetaMask sang mạng Sepolia.";
    }

    return raw;
}

// =====================================================
// 6. KẾT NỐI RPC VÀ KIỂM TRA SMART CONTRACT
// =====================================================

async function getReadContract() {
    if (typeof ethers === "undefined") {
        throw new Error("Không tải được thư viện ethers.js.");
    }

    // Nếu kết nối cũ vẫn hoạt động thì sử dụng lại.
    if (readProvider && readContract) {
        try {
            await readProvider.getBlockNumber();
            return readContract;
        } catch (error) {
            readProvider = null;
            readContract = null;
        }
    }

    let lastError = null;

    for (const rpcUrl of SEPOLIA_RPCS) {
        let provider = null;

        try {
            console.log("Đang thử RPC:", rpcUrl);

            provider = new ethers.providers.JsonRpcProvider(
                rpcUrl,
                {
                    name: "sepolia",
                    chainId: 11155111
                }
            );

            // Kiểm tra Chain ID thực tế của RPC.
            const chainIdHex = await provider.send(
                "eth_chainId",
                []
            );

            if (parseInt(chainIdHex, 16) !== 11155111) {
                throw new Error(
                    "RPC không kết nối tới mạng Ethereum Sepolia."
                );
            }

            const blockNumber = await provider.getBlockNumber();

            console.log("Chain ID:", chainIdHex);
            console.log("Block hiện tại:", blockNumber);

            // Kiểm tra địa chỉ có mã bytecode hay không.
            const bytecode = await provider.getCode(
                CONTRACT_ADDRESS
            );

            if (!bytecode || bytecode === "0x") {
                throw new Error(
                    "Không tìm thấy mã hợp đồng tại địa chỉ " +
                    CONTRACT_ADDRESS +
                    " trên Sepolia. Hãy kiểm tra địa chỉ deploy và mạng deploy."
                );
            }

            // Khởi tạo Contract để đọc dữ liệu.
            readProvider = provider;

            readContract = new ethers.Contract(
                CONTRACT_ADDRESS,
                CONTRACT_ABI,
                readProvider
            );

            console.log("Kết nối RPC thành công:", rpcUrl);
            console.log("Đã tìm thấy bytecode:", CONTRACT_ADDRESS);

            return readContract;

        } catch (error) {
            lastError = error;

            console.error(
                "RPC không sử dụng được:",
                rpcUrl,
                error
            );

            if (
                provider &&
                typeof provider.destroy === "function"
            ) {
                provider.destroy();
            }
        }
    }

    throw new Error(
        "Không kết nối hoặc không tìm thấy contract trên các RPC Sepolia. " +
        (lastError?.message || "Hãy kiểm tra mạng và địa chỉ Contract.")
    );
}

// =====================================================
// 7. KẾT NỐI VÍ METAMASK
// =====================================================

async function connectWallet() {
    if (!window.ethereum) {
        throw new Error(
            "Chưa phát hiện MetaMask. Hãy cài đặt hoặc mở ví MetaMask."
        );
    }

    if (typeof ethers === "undefined") {
        throw new Error("Không tải được thư viện ethers.js.");
    }

    walletProvider = new ethers.providers.Web3Provider(
        window.ethereum,
        "any"
    );

    // Yêu cầu người dùng kết nối ví.
    await walletProvider.send("eth_requestAccounts", []);

    const network = await walletProvider.getNetwork();

    // Nếu sai mạng, yêu cầu chuyển sang Sepolia.
    if (network.chainId !== 11155111) {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [
                    { chainId: SEPOLIA_CHAIN_ID }
                ]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                throw new Error(
                    "MetaMask chưa có mạng Sepolia. Hãy thêm mạng Sepolia."
                );
            }

            throw new Error(
                "Hãy chuyển MetaMask sang Ethereum Sepolia Test Network."
            );
        }
    }

    // Khởi tạo lại provider sau khi đổi mạng.
    walletProvider = new ethers.providers.Web3Provider(
        window.ethereum,
        "any"
    );

    signer = walletProvider.getSigner();

    writeContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
    );

    const account = await signer.getAddress();

    if ($("networkStatus")) {
        $("networkStatus").textContent = "Đã kết nối Sepolia";
    }

    if ($("totalLand")) {
        $("totalLand").textContent = "Đã kết nối";
    }

    if ($("connectWallet")) {
        $("connectWallet").textContent =
            `${account.slice(0, 6)}...${account.slice(-4)}`;
    }

    showMessage(
        `Đã kết nối MetaMask: ${account}`,
        "success"
    );

    return writeContract;
}

// =====================================================
// 8. KIỂM TRA CONTRACT TRƯỚC KHI GỬI GIAO DỊCH
// =====================================================

async function ensureWriteContract() {
    if (!window.ethereum) {
        throw new Error(
            "Chưa phát hiện MetaMask. Hãy cài đặt hoặc mở ví MetaMask."
        );
    }

    if (!writeContract || !signer) {
        await connectWallet();
    }

    const network = await walletProvider.getNetwork();

    if (network.chainId !== 11155111) {
        writeContract = null;

        throw new Error(
            "MetaMask đang ở sai mạng. Vui lòng chọn Sepolia Test Network."
        );
    }

    // Kiểm tra bytecode trước khi gửi giao dịch.
    const bytecode = await walletProvider.getCode(
        CONTRACT_ADDRESS
    );

    if (!bytecode || bytecode === "0x") {
        throw new Error(
            "Không tìm thấy Contract trên mạng MetaMask đang kết nối. " +
            "Hãy kiểm tra địa chỉ và mạng deploy."
        );
    }

    return writeContract;
}

// =====================================================
// 9. TRA CỨU THÔNG TIN THỬA ĐẤT
// =====================================================

async function searchLand(maSo) {
    const contract = await getReadContract();

    let owner;
    let area;
    let history;

    try {
        [owner, area, history] = await Promise.all([
            contract.xemChuSoHuu(maSo),
            contract.xemDienTich(maSo),
            contract.xemLichSuChuyenNhuong(maSo)
        ]);
    } catch (error) {
        throw new Error(
            "Không đọc được thông tin thửa đất. " +
            "Có thể mã thửa đất chưa được đăng ký hoặc ABI không khớp. " +
            friendlyError(error)
        );
    }

    const historyItems = history.length === 0
        ? "<li>Chưa có lịch sử chuyển nhượng.</li>"
        : history.map((item) => {
            const timestamp = Number(item.thoiGian.toString());

            const date = new Date(
                timestamp * 1000
            ).toLocaleString("vi-VN");

            return `
                <li>
                    <strong>Chủ cũ:</strong>
                    <code>${item.chuCu}</code><br>

                    <strong>Chủ mới:</strong>
                    <code>${item.chuMoi}</code><br>

                    <strong>Thời gian:</strong>
                    ${date}
                </li>
            `;
        }).join("");

    $("landInfo").innerHTML = `
        <strong>Thông tin thửa đất số ${maSo}</strong>

        <p>
            <strong>Diện tích:</strong>
            ${area.toString()} m²
        </p>

        <p>
            <strong>Chủ sở hữu hiện tại:</strong><br>
            <code>${owner}</code>
        </p>

        <p><strong>Lịch sử chuyển nhượng:</strong></p>

        <ul>${historyItems}</ul>

        <p>
            <a
                href="https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}"
                target="_blank"
                rel="noopener noreferrer"
            >
                Xem Smart Contract trên Etherscan
            </a>
        </p>
    `;
}

// =====================================================
// 10. KHỞI TẠO CÁC CHỨC NĂNG CỦA WEBSITE
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log("ĐẤTCHAIN: script.js đã được tải.");

    if (typeof ethers === "undefined") {
        showMessage(
            "Không tải được ethers.js. Hãy kiểm tra thư viện CDN.",
            "error"
        );

        return;
    }

    // -------------------------------------------------
    // NÚT KẾT NỐI METAMASK
    // -------------------------------------------------

    $("connectWallet").addEventListener(
        "click",
        async () => {
            try {
                await connectWallet();
            } catch (error) {
                showMessage(
                    friendlyError(error),
                    "error"
                );
            }
        }
    );

    // -------------------------------------------------
    // FORM TRA CỨU THỬA ĐẤT
    // -------------------------------------------------

    $("searchForm").addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            const form = event.currentTarget;

            setFormBusy(
                form,
                true,
                "Đang tra cứu..."
            );

            const maSo = $("searchId").value.trim();

            try {
                parsePositiveInteger(
                    maSo,
                    "Mã số thửa đất"
                );

                $("landInfo").textContent =
                    "Đang truy vấn dữ liệu trên Sepolia...";

                await searchLand(maSo);

                showMessage(
                    "Tra cứu thành công.",
                    "success"
                );

            } catch (error) {
                $("landInfo").textContent =
                    `Không thể tra cứu: ${friendlyError(error)}`;

                showMessage(
                    friendlyError(error),
                    "error"
                );

            } finally {
                setFormBusy(form, false);
            }
        }
    );

    // -------------------------------------------------
    // FORM ĐĂNG KÝ THỬA ĐẤT
    // -------------------------------------------------

    $("registerForm").addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            console.log(
                "Đã chạy sự kiện đăng ký thửa đất."
            );

            const form = event.currentTarget;

            setFormBusy(
                form,
                true,
                "Đang xử lý..."
            );

            try {
                const maSo = parsePositiveInteger(
                    $("landId").value,
                    "Mã số thửa đất"
                );

                const dienTich = parsePositiveInteger(
                    $("area").value,
                    "Diện tích"
                );

                const chuDauTien = validateAddress(
                    $("firstOwner").value,
                    "Địa chỉ ví chủ đầu tiên"
                );

                const contract = await ensureWriteContract();

                showMessage(
                    "Hãy xác nhận giao dịch đăng ký trong MetaMask.",
                    "info"
                );

                const tx = await contract.dangKyThuaDat(
                    maSo,
                    dienTich,
                    chuDauTien
                );

                showMessage(
                    `Đã gửi giao dịch. Đang chờ xác nhận: ${tx.hash}`,
                    "info"
                );

                await tx.wait();

                successfulTransactions++;

                if ($("totalTransfer")) {
                    $("totalTransfer").textContent =
                        String(successfulTransactions);
                }

                showMessage(
                    `Đăng ký thửa đất ${maSo} thành công! TxHash: ${tx.hash}`,
                    "success"
                );

                await searchLand(maSo);

                form.reset();

            } catch (error) {
                showMessage(
                    `Đăng ký thất bại: ${friendlyError(error)}`,
                    "error"
                );

            } finally {
                setFormBusy(form, false);
            }
        }
    );

    // -------------------------------------------------
    // FORM CHUYỂN NHƯỢNG THỬA ĐẤT
    // -------------------------------------------------

    $("transferForm").addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            console.log(
                "Đã chạy sự kiện chuyển nhượng."
            );

            const form = event.currentTarget;

            setFormBusy(
                form,
                true,
                "Đang xử lý..."
            );

            try {
                const maSo = parsePositiveInteger(
                    $("transferId").value,
                    "Mã số thửa đất"
                );

                const chuMoi = validateAddress(
                    $("newOwner").value,
                    "Ví chủ sở hữu mới"
                );

                const contract = await ensureWriteContract();

                const currentAccount =
                    await signer.getAddress();

                // Kiểm tra chủ sở hữu hiện tại trên blockchain.
                const owner = await contract.xemChuSoHuu(maSo);

                if (
                    owner.toLowerCase() !==
                    currentAccount.toLowerCase()
                ) {
                    throw new Error(
                        `Ví đang kết nối (${currentAccount}) ` +
                        `không phải chủ sở hữu hiện tại (${owner}).`
                    );
                }

                showMessage(
                    "Hãy xác nhận giao dịch chuyển nhượng trong MetaMask.",
                    "info"
                );

                const tx = await contract.chuyenNhuong(
                    maSo,
                    chuMoi
                );

                showMessage(
                    `Đã gửi giao dịch. Đang chờ xác nhận: ${tx.hash}`,
                    "info"
                );

                await tx.wait();

                successfulTransactions++;

                if ($("totalTransfer")) {
                    $("totalTransfer").textContent =
                        String(successfulTransactions);
                }

                showMessage(
                    `Chuyển nhượng thửa đất ${maSo} thành công! TxHash: ${tx.hash}`,
                    "success"
                );

                await searchLand(maSo);

                form.reset();

            } catch (error) {
                showMessage(
                    `Chuyển nhượng thất bại: ${friendlyError(error)}`,
                    "error"
                );

            } finally {
                setFormBusy(form, false);
            }
        }
    );

    // -------------------------------------------------
    // XỬ LÝ KHI TÀI KHOẢN HOẶC MẠNG THAY ĐỔI
    // -------------------------------------------------

    if (window.ethereum) {
        window.ethereum.on?.(
            "accountsChanged",
            () => {
                writeContract = null;
                signer = null;

                if ($("networkStatus")) {
                    $("networkStatus").textContent =
                        "Ví đã thay đổi";
                }

                if ($("totalLand")) {
                    $("totalLand").textContent =
                        "Chưa kết nối";
                }

                if ($("connectWallet")) {
                    $("connectWallet").textContent =
                        "Kết nối MetaMask";
                }
            }
        );

        window.ethereum.on?.(
            "chainChanged",
            () => window.location.reload()
        );
    }
});
