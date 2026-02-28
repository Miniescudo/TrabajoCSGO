import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const rarityWeights = {
  blue: 74,
  purple: 19,
  red: 7,
};

const SPINNER_ITEM_WIDTH = 220;
const SPINNER_GAP = 12;
const SPINNER_SIDE_PADDING = 16;

const INVENTORY_KEY = "cobredrop_inventory";
const USER_KEY = "cobredrop_user";
const BALANCE_KEY = "cobredrop_balance";
const WALLET_TABLE = "user_wallets";
const INVENTORY_TABLE = "user_inventory";

const fundOptions = [1, 5, 10, 50, 100];

const cases = [
  {
    id: "caja-cobre-1",
    name: "Copper Pulse",
    price: 2.99,
    weapons: [
      {
        name: "AK-47 | Blue Laminate",
        color: "blue",
        image: "/weapons/Ak.jpg",
        price: 2.15,
      },
      {
        name: "M4A1-S | Bright Water",
        color: "blue",
        image: "/weapons/m4a1.png",
        price: 2.6,
      },
      {
        name: "AWP | Neo-Noir",
        color: "purple",
        image: "/weapons/AWP.png",
        price: 18.9,
      },
      {
        name: "Karambit | Doppler",
        color: "red",
        image: "/weapons/karambit.jpg",
        price: 389.0,
      },
    ],
  },
  {
    id: "caja-cobre-2",
    name: "Molten Strike",
    price: 3.49,
    weapons: [
      {
        name: "USP-S | Guardian",
        color: "blue",
        image: "/weapons/usp.jpg",
        price: 2.4,
      },
      {
        name: "Glock-18 | Water Elemental",
        color: "blue",
        image: "/weapons/glock.png",
        price: 3.1,
      },
      {
        name: "Desert Eagle | Printstream",
        color: "purple",
        image: "/weapons/Deagle.png",
        price: 51.5,
      },
      {
        name: "Butterfly Knife | Fade",
        color: "red",
        image: "/weapons/butterfly.jpg",
        price: 1149.0,
      },
    ],
  },
  {
    id: "caja-cobre-3",
    name: "Neon Frost",
    price: 4.29,
    weapons: [
      {
        name: "MP9 | Starlight Protector",
        color: "blue",
        image: "/weapons/Mp9.webp",
        price: 2.95,
      },
      {
        name: "P250 | Cyber Shell",
        color: "blue",
        image: "/weapons/P250.png",
        price: 3.75,
      },
      {
        name: "AK-47 | Ice Coaled",
        color: "purple",
        image: "/weapons/AKICE.png",
        price: 30.2,
      },
      {
        name: "Specialist Gloves | Crimson Web",
        color: "red",
        image: "/weapons/Gloves.webp",
        price: 598.0,
      },
    ],
  },
  {
    id: "caja-cobre-4",
    name: "Vortex Prime",
    price: 4.99,
    weapons: [
      {
        name: "FAMAS | Mecha Industries",
        color: "blue",
        image: "/weapons/Famas.png",
        price: 3.45,
      },
      {
        name: "Five-SeveN | Monkey Business",
        color: "blue",
        image: "/weapons/FiveSeven.png",
        price: 4.65,
      },
      {
        name: "M4A4 | The Emperor",
        color: "purple",
        image: "/weapons/M4A4.png",
        price: 36.9,
      },
      {
        name: "Sport Gloves | Vice",
        color: "red",
        image: "/weapons/Guantes.png",
        price: 1188.0,
      },
    ],
  },
];

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function pickWeapon(weapons) {
  const weighted = weapons.map((weapon) => ({
    ...weapon,
    weight: rarityWeights[weapon.color] ?? 0,
  }));

  const total = weighted.reduce((acc, weapon) => acc + weapon.weight, 0);
  const roll = Math.random() * total;

  let cursor = 0;
  for (const weapon of weighted) {
    cursor += weapon.weight;
    if (roll <= cursor) {
      return weapon;
    }
  }

  return weighted[0];
}

function buildSpinnerTrack(caseData, winner, winnerIndex, totalItems = 48) {
  const track = [];

  for (let i = 0; i < totalItems; i += 1) {
    const randomItem = caseData.weapons[Math.floor(Math.random() * caseData.weapons.length)];
    track.push({ ...randomItem, id: `rnd-${i}-${randomItem.name}` });
  }

  track[winnerIndex] = { ...winner, id: `winner-${Date.now()}-${winner.name}` };
  return track;
}

async function saveOpening(caseName, weapon) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("openings").insert({
    case_name: caseName,
    weapon_name: weapon.name,
    rarity: weapon.color,
    opened_at: new Date().toISOString(),
  });

  if (error) {
    console.error("No se pudo guardar en Supabase:", error.message);
  }
}

function formatTime(isoDate) {
  if (!isoDate) {
    return "-";
  }

  const date = new Date(isoDate);
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPrice(value) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function userStorageKey(baseKey, username) {
  if (!username) {
    return `${baseKey}_guest`;
  }

  const safe = String(username).trim().toLowerCase().replace(/\s+/g, "_");
  return `${baseKey}_${safe}`;
}

async function loadCloudUserData(username) {
  if (!supabase || !username) {
    return null;
  }

  const [walletRes, inventoryRes] = await Promise.all([
    supabase.from(WALLET_TABLE).select("balance").eq("username", username).maybeSingle(),
    supabase.from(INVENTORY_TABLE).select("*").eq("username", username).order("opened_at", { ascending: false }),
  ]);

  if (walletRes.error || inventoryRes.error) {
    return { error: walletRes.error || inventoryRes.error };
  }

  return {
    balance: Number(walletRes.data?.balance ?? 0),
    inventory: (inventoryRes.data ?? []).map((entry) => ({
      id: entry.item_id,
      case_name: entry.case_name,
      weapon_name: entry.weapon_name,
      weapon_image: entry.weapon_image,
      weapon_price: Number(entry.weapon_price ?? 0),
      rarity: entry.rarity,
      opened_at: entry.opened_at,
    })),
  };
}

async function saveCloudUserData(username, balance, inventory) {
  if (!supabase || !username) {
    return { ok: true };
  }

  const walletPayload = {
    username,
    balance: roundMoney(balance),
    updated_at: new Date().toISOString(),
  };

  const walletRes = await supabase.from(WALLET_TABLE).upsert(walletPayload, { onConflict: "username" });
  if (walletRes.error) {
    return { ok: false, error: walletRes.error };
  }

  const deleteRes = await supabase.from(INVENTORY_TABLE).delete().eq("username", username);
  if (deleteRes.error) {
    return { ok: false, error: deleteRes.error };
  }

  if (!inventory.length) {
    return { ok: true };
  }

  const rows = inventory.map((entry) => ({
    username,
    item_id: entry.id,
    case_name: entry.case_name,
    weapon_name: entry.weapon_name,
    weapon_image: entry.weapon_image ?? null,
    weapon_price: Number(entry.weapon_price ?? 0),
    rarity: entry.rarity,
    opened_at: entry.opened_at,
  }));

  const insertRes = await supabase.from(INVENTORY_TABLE).insert(rows);
  if (insertRes.error) {
    return { ok: false, error: insertRes.error };
  }

  return { ok: true };
}

export default function App() {
  const [activeView, setActiveView] = useState("cases");
  const [latestDrop, setLatestDrop] = useState(null);
  const [revealedDrop, setRevealedDrop] = useState(null);
  const [activeCase, setActiveCase] = useState(null);
  const [spinItems, setSpinItems] = useState([]);
  const [spinOffset, setSpinOffset] = useState(0);
  const [spinDuration, setSpinDuration] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [user, setUser] = useState(() => loadJSON(USER_KEY, null));
  const [balance, setBalance] = useState(0);
  const [notice, setNotice] = useState("");
  const [coinflipStakeId, setCoinflipStakeId] = useState("");
  const [coinflipTargetName, setCoinflipTargetName] = useState("");
  const [isCoinflipRolling, setIsCoinflipRolling] = useState(false);
  const [coinflipFace, setCoinflipFace] = useState(null);
  const [coinflipAnimKey, setCoinflipAnimKey] = useState(0);

  const [loginName, setLoginName] = useState("");

  const spinnerWindowRef = useRef(null);
  const resultTimerRef = useRef(null);
  const coinflipTimerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const spinSoundIntervalRef = useRef(null);
  const syncTimerRef = useRef(null);
  const hydratingRef = useRef(false);

  useEffect(() => {
    if (user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.username) {
      return;
    }

    const invKey = userStorageKey(INVENTORY_KEY, user.username);
    window.localStorage.setItem(invKey, JSON.stringify(inventory));
  }, [inventory, user]);

  useEffect(() => {
    if (!user?.username) {
      return;
    }

    const balKey = userStorageKey(BALANCE_KEY, user.username);
    window.localStorage.setItem(balKey, JSON.stringify(roundMoney(balance)));
  }, [balance, user]);

  useEffect(() => {
    if (!user?.username) {
      setInventory([]);
      setBalance(0);
      return;
    }

    const invKey = userStorageKey(INVENTORY_KEY, user.username);
    const balKey = userStorageKey(BALANCE_KEY, user.username);
    const localInventory = loadJSON(invKey, []);
    const localBalance = Number(loadJSON(balKey, 0)) || 0;
    setInventory(localInventory);
    setBalance(localBalance);

    hydratingRef.current = true;
    loadCloudUserData(user.username)
      .then((cloud) => {
        if (!cloud || cloud.error) {
          return;
        }

        setInventory(cloud.inventory ?? []);
        setBalance(Number(cloud.balance ?? 0));
      })
      .finally(() => {
        hydratingRef.current = false;
      });
  }, [user]);

  useEffect(() => {
    if (!user?.username || hydratingRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    const username = user.username;
    const nextBalance = balance;
    const nextInventory = inventory;

    syncTimerRef.current = window.setTimeout(async () => {
      const result = await saveCloudUserData(username, nextBalance, nextInventory);
      if (!result.ok) {
        setNotice(`No se pudo sincronizar con Supabase: ${result.error.message}`);
      }
    }, 700);
  }, [user, balance, inventory]);

  useEffect(() => {
    return () => {
      if (resultTimerRef.current) {
        clearTimeout(resultTimerRef.current);
      }
      if (coinflipTimerRef.current) {
        clearTimeout(coinflipTimerRef.current);
      }
      if (spinSoundIntervalRef.current) {
        clearInterval(spinSoundIntervalRef.current);
      }
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      if (audioCtxRef.current?.state !== "closed") {
        audioCtxRef.current?.close();
      }
    };
  }, []);

  const weaponImageByName = useMemo(
    () =>
      cases.reduce((acc, caseData) => {
        caseData.weapons.forEach((weapon) => {
          acc[weapon.name] = weapon.image;
        });
        return acc;
      }, {}),
    []
  );

  const weaponPriceByName = useMemo(
    () =>
      cases.reduce((acc, caseData) => {
        caseData.weapons.forEach((weapon) => {
          acc[weapon.name] = weapon.price;
        });
        return acc;
      }, {}),
    []
  );

  const allWeapons = useMemo(
    () =>
      cases.flatMap((caseData) =>
        caseData.weapons.map((weapon) => ({
          ...weapon,
          caseName: caseData.name,
        }))
      ),
    []
  );

  const selectedStake = useMemo(
    () => inventory.find((entry) => entry.id === coinflipStakeId) ?? null,
    [inventory, coinflipStakeId]
  );

  const selectedStakePrice = Number(
    selectedStake?.weapon_price ?? weaponPriceByName[selectedStake?.weapon_name] ?? 0
  );

  const coinflipTargets = useMemo(() => {
    if (!selectedStake) {
      return [];
    }

    return allWeapons
      .filter((weapon) => weapon.name !== selectedStake.weapon_name && weapon.price > selectedStakePrice)
      .sort((a, b) => a.price - b.price);
  }, [allWeapons, selectedStake, selectedStakePrice]);

  const selectedTarget = useMemo(
    () => coinflipTargets.find((weapon) => weapon.name === coinflipTargetName) ?? null,
    [coinflipTargets, coinflipTargetName]
  );

  const coinflipWinChance = useMemo(() => {
    if (!selectedStake || !selectedTarget || selectedStakePrice <= 0) {
      return 0;
    }

    const ratio = selectedTarget.price / selectedStakePrice;
    const scaled = 65 / Math.pow(ratio, 1.35);
    return Math.max(3, Math.min(48, scaled));
  }, [selectedStake, selectedTarget, selectedStakePrice]);

  useEffect(() => {
    if (coinflipStakeId && !inventory.some((entry) => entry.id === coinflipStakeId)) {
      setCoinflipStakeId("");
      setCoinflipTargetName("");
    }
  }, [inventory, coinflipStakeId]);

  useEffect(() => {
    if (coinflipTargetName && !coinflipTargets.some((weapon) => weapon.name === coinflipTargetName)) {
      setCoinflipTargetName("");
    }
  }, [coinflipTargets, coinflipTargetName]);

  const rarityInfo = useMemo(
    () => [
      { color: "blue", text: "Azul (74%)" },
      { color: "purple", text: "Morado (19%)" },
      { color: "red", text: "Rojo (7%)" },
    ],
    []
  );

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new window.AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playOpenClickSound = () => {
    const ctx = ensureAudio();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.05);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  };

  const playSpinTick = () => {
    const ctx = ensureAudio();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(900, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  };

  const startSpinSound = () => {
    if (spinSoundIntervalRef.current) {
      clearInterval(spinSoundIntervalRef.current);
    }
    spinSoundIntervalRef.current = window.setInterval(() => {
      playSpinTick();
    }, 75);
  };

  const stopSpinSound = () => {
    if (spinSoundIntervalRef.current) {
      clearInterval(spinSoundIntervalRef.current);
      spinSoundIntervalRef.current = null;
    }
  };

  const calculateSpinOffset = (winnerIndex) => {
    const viewportWidth = spinnerWindowRef.current?.clientWidth ?? 960;
    const targetCenter = winnerIndex * (SPINNER_ITEM_WIDTH + SPINNER_GAP);
    const centerFix = viewportWidth / 2 - SPINNER_ITEM_WIDTH / 2 - SPINNER_SIDE_PADDING;
    const jitter = Math.random() * 20 - 10;

    return Math.max(0, targetCenter - centerFix + jitter);
  };

  const openCase = async (caseData) => {
    if (isSpinning || revealedDrop) {
      return;
    }

    if (!user) {
      setNotice("Inicia sesion para abrir cajas.");
      setActiveView("login");
      return;
    }

    if (balance < caseData.price) {
      setNotice("Saldo insuficiente. Recarga tu cartera.");
      return;
    }

    setNotice("");
    setBalance((prev) => roundMoney(prev - caseData.price));

    playOpenClickSound();
    startSpinSound();
    setIsSpinning(true);
    setActiveCase(caseData.name);

    const winner = pickWeapon(caseData.weapons);
    const winnerIndex = 34 + Math.floor(Math.random() * 6);
    const track = buildSpinnerTrack(caseData, winner, winnerIndex);
    const duration = 4300 + Math.floor(Math.random() * 1200);

    setSpinItems(track);
    setSpinDuration(0);
    setSpinOffset(0);

    window.setTimeout(() => {
      setSpinDuration(duration);
      setSpinOffset(calculateSpinOffset(winnerIndex));
    }, 20);

    if (resultTimerRef.current) {
      clearTimeout(resultTimerRef.current);
    }

    resultTimerRef.current = window.setTimeout(async () => {
      const now = new Date().toISOString();
      const drop = {
        caseName: caseData.name,
        name: winner.name,
        color: winner.color,
        image: winner.image,
        price: winner.price,
      };

      const inventoryEntry = {
        id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        case_name: caseData.name,
        weapon_name: winner.name,
        weapon_image: winner.image,
        weapon_price: winner.price,
        rarity: winner.color,
        opened_at: now,
      };

      setLatestDrop(drop);
      setRevealedDrop(drop);
      setInventory((prev) => [inventoryEntry, ...prev].slice(0, 80));
      await saveOpening(caseData.name, winner);
      stopSpinSound();
      setIsSpinning(false);
    }, duration + 120);
  };

  const addFunds = (amount) => {
    if (!user) {
      setNotice("Inicia sesion para recargar.");
      setActiveView("login");
      return;
    }

    setBalance((prev) => roundMoney(prev + amount));
    setNotice(`Se anadieron ${formatPrice(amount)} a tu cartera.`);
  };

  const sellItem = (itemId) => {
    const item = inventory.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const itemPrice = Number(item.weapon_price ?? weaponPriceByName[item.weapon_name] ?? 0);
    setInventory((prev) => prev.filter((entry) => entry.id !== itemId));
    setBalance((prev) => roundMoney(prev + itemPrice));
    setNotice(`Vendiste ${item.weapon_name} por ${formatPrice(itemPrice)}.`);
  };

  const sellAllItems = () => {
    if (!inventory.length) {
      setNotice("Tu inventario ya esta vacio.");
      return;
    }

    const total = inventory.reduce((acc, entry) => {
      const value = Number(entry.weapon_price ?? weaponPriceByName[entry.weapon_name] ?? 0);
      return acc + value;
    }, 0);

    setInventory([]);
    setBalance((prev) => roundMoney(prev + total));
    setNotice(`Vendiste todo el inventario por ${formatPrice(total)}.`);
  };

  const handleLogin = (event) => {
    event.preventDefault();
    const username = loginName.trim();

    if (!username) {
      setNotice("Escribe un usuario valido.");
      return;
    }

    setUser({ username });
    setActiveView("inventory");
    setNotice(`Sesion iniciada como ${username}.`);
    setLoginName("");
  };

  const handleLogout = async () => {
    if (user?.username) {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      const result = await saveCloudUserData(user.username, balance, inventory);
      if (!result.ok) {
        setNotice(`No se pudo guardar en Supabase antes de salir: ${result.error.message}`);
        return;
      }
    }

    setUser(null);
    setBalance(0);
    setCoinflipStakeId("");
    setCoinflipTargetName("");
    setIsCoinflipRolling(false);
    setCoinflipFace(null);
    if (coinflipTimerRef.current) {
      clearTimeout(coinflipTimerRef.current);
      coinflipTimerRef.current = null;
    }
    setNotice("Sesion cerrada.");
    setActiveView("cases");
  };

  const runCoinflip = () => {
    if (isCoinflipRolling || isSpinning || revealedDrop) {
      return;
    }

    if (!user) {
      setNotice("Inicia sesion para jugar coinflip.");
      setActiveView("login");
      return;
    }

    if (!selectedStake) {
      setNotice("Selecciona un arma de tu inventario para apostar.");
      return;
    }

    if (!selectedTarget) {
      setNotice("Elige un arma objetivo con precio mayor.");
      return;
    }

    const stakeId = selectedStake.id;
    const stakeName = selectedStake.weapon_name;
    const stakePrice = selectedStakePrice;
    const targetSnapshot = selectedTarget;
    const winChance = coinflipWinChance;
    const didWin = Math.random() * 100 < winChance;
    const now = new Date().toISOString();

    if (coinflipTimerRef.current) {
      clearTimeout(coinflipTimerRef.current);
      coinflipTimerRef.current = null;
    }

    setIsCoinflipRolling(true);
    setCoinflipFace(null);
    setCoinflipAnimKey((prev) => prev + 1);
    setNotice("Lanzando moneda...");
    playOpenClickSound();

    coinflipTimerRef.current = window.setTimeout(() => {
      setInventory((prev) => {
        const withoutStake = prev.filter((entry) => entry.id !== stakeId);
        if (!didWin) {
          return withoutStake;
        }

        const rewardEntry = {
          id: `coinflip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          case_name: "Coinflip",
          weapon_name: targetSnapshot.name,
          weapon_image: targetSnapshot.image,
          weapon_price: targetSnapshot.price,
          rarity: targetSnapshot.color,
          opened_at: now,
        };

        return [rewardEntry, ...withoutStake].slice(0, 80);
      });

      if (didWin) {
        setLatestDrop({
          caseName: "Coinflip",
          name: targetSnapshot.name,
          color: targetSnapshot.color,
          image: targetSnapshot.image,
          price: targetSnapshot.price,
        });
        setNotice(
          `Cara. Ganaste ${targetSnapshot.name} (${formatPrice(targetSnapshot.price)}) apostando ${stakeName} (${formatPrice(stakePrice)}). Probabilidad: ${winChance.toFixed(1)}%.`
        );
      } else {
        setNotice(`Cruz. Perdiste ${stakeName} (${formatPrice(stakePrice)}). Probabilidad: ${winChance.toFixed(1)}%.`);
      }

      setCoinflipFace(didWin ? "Cara" : "Cruz");
      setCoinflipStakeId("");
      setCoinflipTargetName("");
      setIsCoinflipRolling(false);
      coinflipTimerRef.current = null;
    }, 1150);
  };

  return (
    <div className="page">
      <div className="bg-glow" />

      <header className="topbar">
        <div className="brand">Cobredrop</div>
        <nav>
          <button className={`tab ${activeView === "cases" ? "active" : ""}`} type="button" onClick={() => setActiveView("cases")}>
            Cajas
          </button>
          <button
            className={`tab ${activeView === "inventory" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("inventory")}
          >
            Inventario
          </button>
          <button className={`tab ${activeView === "coinflip" ? "active" : ""}`} type="button" onClick={() => setActiveView("coinflip")}>
            Coinflip
          </button>
          <button className="tab user-tab" type="button" onClick={() => setActiveView(user ? "inventory" : "login")}
          >
            <span className="user-dot">{user ? user.username.slice(0, 1).toUpperCase() : "U"}</span>
            <span>{user ? user.username : "Iniciar sesion"}</span>
          </button>
        </nav>
      </header>

      {notice && <p className="notice">{notice}</p>}

      {activeView === "login" && (
        <section className="login-panel">
          <h2>Iniciar sesion</h2>
          <p>Entra con un usuario para usar cartera, abrir cajas y vender items.</p>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Tu usuario"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
            />
            <button type="submit">Entrar</button>
          </form>
        </section>
      )}

      {activeView === "cases" && (
        <>
          <section className="hero">
            <h1>Otra vez aqui, vicioso</h1>
            <p className="wallet-line">Saldo: {formatPrice(balance)}</p>
          </section>

          <section className="spinner-shell">
            <div className="spinner-header">
              <h2>{activeCase ?? "Simulador de apertura"}</h2>
              <span>{isSpinning ? "Abriendo..." : "Listo"}</span>
            </div>

            <div className="spinner-window" ref={spinnerWindowRef}>
              <div className="pointer" />
              <div
                className="spinner-track"
                style={{
                  transform: `translate3d(-${spinOffset}px, 0, 0)`,
                  transition: spinDuration ? `transform ${spinDuration}ms cubic-bezier(0.1, 0.86, 0.2, 1)` : "none",
                }}
              >
                {spinItems.length > 0 ? (
                  spinItems.map((item) => (
                    <article key={item.id} className={`spinner-item ${item.color}`}>
                      <img className="spinner-thumb" src={item.image} alt={item.name} />
                      <div className="item-meta">
                        <span>{item.name}</span>
                        <small>{formatPrice(item.price)}</small>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="placeholder">Abre una caja para iniciar la tirada.</p>
                )}
              </div>
            </div>
          </section>

          <main className="cases-grid">
            {cases.map((caseData) => (
              <section key={caseData.id} className="case-card">
                <div className="case-head">
                  <h3>{caseData.name}</h3>
                  <span>{formatPrice(caseData.price)}</span>
                </div>

                <div className="weapons-list">
                  {caseData.weapons.map((weapon) => (
                    <article key={weapon.name} className={`weapon ${weapon.color}`}>
                      <img className="weapon-thumb" src={weapon.image} alt={weapon.name} />
                      <div className="item-meta">
                        <span>{weapon.name}</span>
                        <small>{formatPrice(weapon.price)}</small>
                      </div>
                    </article>
                  ))}
                </div>

                <button type="button" onClick={() => openCase(caseData)} disabled={isSpinning || Boolean(revealedDrop)}>
                  {isSpinning ? "Procesando..." : revealedDrop ? "Pulsa continuar" : `Abrir (${formatPrice(caseData.price)})`}
                </button>
              </section>
            ))}
          </main>

          <section className="bottom-grid">
            <article className="probability-panel">
              <h3>Probabilidades</h3>
              <div className="legend">
                {rarityInfo.map((item) => (
                  <span key={item.color} className={`pill ${item.color}`}>
                    {item.text}
                  </span>
                ))}
              </div>
            </article>

            <article className="drop-result">
              <h3>Ultimo drop</h3>
              {latestDrop ? (
                <p>
                  <strong>{latestDrop.caseName}</strong>: <span className={latestDrop.color}>{latestDrop.name}</span>{" "}
                  <span className="price-tag">{formatPrice(latestDrop.price)}</span>
                </p>
              ) : (
                <p className="muted">Aun no abriste ninguna caja.</p>
              )}
            </article>
          </section>

          {revealedDrop && (
            <section className="reward-overlay">
              <article className={`reward-card ${revealedDrop.color}`}>
                <p className="reward-kicker">Enhorabuena</p>
                <h3>Te ha tocado un item</h3>
                <img className="reward-image" src={revealedDrop.image} alt={revealedDrop.name} />
                <p className={`reward-name ${revealedDrop.color}`}>{revealedDrop.name}</p>
                <p className="reward-price">{formatPrice(revealedDrop.price)}</p>
                <button type="button" onClick={() => setRevealedDrop(null)}>
                  Continuar
                </button>
              </article>
            </section>
          )}
        </>
      )}

      {activeView === "inventory" && (
        <section className="inventory-layout">
          <article className="inventory-panel inventory-view">
            <div className="inventory-head">
              <h3>Inventario</h3>
              <button type="button" onClick={sellAllItems}>
                Vender todo
              </button>
            </div>

            <div className="inventory-list">
              {inventory.length > 0 ? (
                inventory.map((entry) => {
                  const itemPrice = entry.weapon_price ?? weaponPriceByName[entry.weapon_name];
                  return (
                    <div key={entry.id} className="inventory-row">
                      <span>{entry.case_name}</span>
                      <strong className={entry.rarity}>
                        <img
                          className="inventory-thumb"
                          src={entry.weapon_image ?? weaponImageByName[entry.weapon_name]}
                          alt={entry.weapon_name}
                        />
                        <div className="item-meta">
                          <span>{entry.weapon_name}</span>
                          <small>{formatPrice(itemPrice)}</small>
                        </div>
                      </strong>
                      <div className="inventory-actions">
                        <time>{formatTime(entry.opened_at)}</time>
                        <button type="button" className="sell-btn" onClick={() => sellItem(entry.id)}>
                          Vender
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="muted">Tu inventario esta vacio.</p>
              )}
            </div>
          </article>

          <aside className="account-panel">
            <button className="profile-logo" type="button" onClick={() => setActiveView(user ? "inventory" : "login")}>
              {user ? user.username.slice(0, 1).toUpperCase() : "U"}
            </button>
            {user ? (
              <>
                <p className="account-user">Usuario: <strong>{user.username}</strong></p>
                <p className="account-balance">Cartera: <strong>{formatPrice(balance)}</strong></p>
                <div className="fund-grid">
                  {fundOptions.map((amount) => (
                    <button key={amount} type="button" className="fund-btn" onClick={() => addFunds(amount)}>
                      +{formatPrice(amount)}
                    </button>
                  ))}
                </div>
                <button type="button" className="logout-btn" onClick={handleLogout}>
                  Cerrar sesion
                </button>
              </>
            ) : (
              <>
                <p className="muted">Pulsa el logo para iniciar sesion.</p>
                <button type="button" className="fund-btn" onClick={() => setActiveView("login")}>Iniciar sesion</button>
              </>
            )}
          </aside>
        </section>
      )}

      {activeView === "coinflip" && (
        <section className="coinflip-layout">
          <article className="inventory-panel">
            <div className="inventory-head">
              <h3>Coinflip</h3>
            </div>

            <div className="coinflip-visual">
              <div className="coin-stage">
                <div
                  key={coinflipAnimKey}
                  className={`coin ${isCoinflipRolling ? "falling" : ""} ${coinflipFace === "Cara" ? "show-heads" : coinflipFace === "Cruz" ? "show-tails" : ""}`}
                >
                  <span className="coin-face coin-front">Cara</span>
                  <span className="coin-face coin-back">Cruz</span>
                </div>
                <div className="coin-shadow" />
              </div>
              <p className="coin-status">
                {isCoinflipRolling
                  ? "La moneda esta cayendo..."
                  : coinflipFace
                    ? `Resultado visual: ${coinflipFace}`
                    : "Pulsa lanzar moneda para ver la caida."}
              </p>
            </div>

            <div className="coinflip-grid">
              <div className="coinflip-column">
                <h4>1. Tu arma apostada</h4>
                <div className="coinflip-list">
                  {inventory.length > 0 ? (
                    inventory.map((entry) => {
                      const itemPrice = Number(entry.weapon_price ?? weaponPriceByName[entry.weapon_name] ?? 0);
                      const isActive = coinflipStakeId === entry.id;

                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={`coinflip-option ${isActive ? "active" : ""}`}
                          onClick={() => {
                            setCoinflipStakeId(entry.id);
                            setCoinflipTargetName("");
                          }}
                          disabled={isCoinflipRolling}
                        >
                          <img
                            className="coinflip-thumb"
                            src={entry.weapon_image ?? weaponImageByName[entry.weapon_name]}
                            alt={entry.weapon_name}
                          />
                          <div className="item-meta">
                            <span>{entry.weapon_name}</span>
                            <small>{formatPrice(itemPrice)}</small>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="muted">Tu inventario esta vacio.</p>
                  )}
                </div>
              </div>

              <div className="coinflip-column">
                <h4>2. Arma objetivo (mas cara)</h4>
                <div className="coinflip-list">
                  {selectedStake ? (
                    coinflipTargets.length > 0 ? (
                      coinflipTargets.map((weapon) => {
                        const isActive = coinflipTargetName === weapon.name;

                        return (
                          <button
                            key={weapon.name}
                            type="button"
                            className={`coinflip-option ${isActive ? "active" : ""}`}
                            onClick={() => setCoinflipTargetName(weapon.name)}
                            disabled={isCoinflipRolling}
                          >
                            <img className="coinflip-thumb" src={weapon.image} alt={weapon.name} />
                            <div className="item-meta">
                              <span>{weapon.name}</span>
                              <small>{formatPrice(weapon.price)}</small>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="muted">No hay armas de mayor precio para esa apuesta.</p>
                    )
                  ) : (
                    <p className="muted">Selecciona primero tu arma apostada.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="coinflip-summary">
              <p>
                Apostada: <strong>{selectedStake ? `${selectedStake.weapon_name} (${formatPrice(selectedStakePrice)})` : "-"}</strong>
              </p>
              <p>
                Objetivo: <strong>{selectedTarget ? `${selectedTarget.name} (${formatPrice(selectedTarget.price)})` : "-"}</strong>
              </p>
              <p>
                Probabilidad de exito: <strong>{selectedTarget ? `${coinflipWinChance.toFixed(1)}%` : "-"}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={runCoinflip}
              disabled={!selectedStake || !selectedTarget || isCoinflipRolling || isSpinning || Boolean(revealedDrop)}
            >
              {isCoinflipRolling ? "Lanzando..." : "Lanzar moneda"}
            </button>
          </article>

          <aside className="account-panel">
            <button className="profile-logo" type="button" onClick={() => setActiveView(user ? "inventory" : "login")}>
              {user ? user.username.slice(0, 1).toUpperCase() : "U"}
            </button>
            {user ? (
              <>
                <p className="account-user">Usuario: <strong>{user.username}</strong></p>
                <p className="account-balance">Cartera: <strong>{formatPrice(balance)}</strong></p>
                <div className="fund-grid">
                  {fundOptions.map((amount) => (
                    <button key={amount} type="button" className="fund-btn" onClick={() => addFunds(amount)}>
                      +{formatPrice(amount)}
                    </button>
                  ))}
                </div>
                <button type="button" className="logout-btn" onClick={handleLogout}>
                  Cerrar sesion
                </button>
              </>
            ) : (
              <>
                <p className="muted">Pulsa el logo para iniciar sesion.</p>
                <button type="button" className="fund-btn" onClick={() => setActiveView("login")}>Iniciar sesion</button>
              </>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}
