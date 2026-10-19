// Tracker screen

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";
import {
  createTransaction,
  deleteTransaction,
  getTrackerOverview,
  updateBill,
  createBill,
  stopTrackingBill,
  deleteBillHistory,
} from "../../services/api";
import { useSimulator } from "../../contexts/SimulatorContext";

const SPENDING_CATEGORIES = [
  "Food & Drinks",
  "Transport",
  "Shopping",
  "Entertainment",
  "Gaming",
  "Fitness",
  "Other",
];

// Allowance future months for testing purposes
const ALLOW_FUTURE_MONTH_TESTING = true;

const STATUS_OPTIONS = [
  {
    label: "Paid on time",
    value: "paid_on_time",
  },
  {
    label: "Paid late",
    value: "late",
  },
  {
    label: "Missed",
    value: "missed",
  },
];

export default function TrackerScreen() {
  const isFocused = useIsFocused();
  const { clearSimulatorDraft } = useSimulator();

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [spendingModalVisible, setSpendingModalVisible] = useState(false);
  const [billStatusModalVisible, setBillStatusModalVisible] = useState(false);
  const [addBillModalVisible, setAddBillModalVisible] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  // Spending form
  const [txnAmount, setTxnAmount] = useState("");
  const [txnCategory, setTxnCategory] = useState("");
  const [txnName, setTxnName] = useState("");
  const [txnDate, setTxnDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bill form
  const [newBillName, setNewBillName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillDueDay, setNewBillDueDay] = useState("");

  // Tab toggle
  const [activeTab, setActiveTab] = useState("spending");

  // Month currently displayed in Tracker.
  const today = new Date();
  const actualCurrentMonth = today.getMonth() + 1;
  const actualCurrentYear = today.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(actualCurrentMonth);
  const [selectedYear, setSelectedYear] = useState(actualCurrentYear);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, selectedMonth, selectedYear]);

  async function loadData() {
    try {
      const data = await getTrackerOverview(selectedMonth, selectedYear);
      setOverview(data);
    } catch (error) {
      console.error("Failed to load tracker data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [selectedMonth, selectedYear]);

  function handlePreviousMonth() {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((year) => year - 1);
    } else {
      setSelectedMonth((month) => month - 1);
    }
  }

  function canMoveToNextMonth() {
    if (ALLOW_FUTURE_MONTH_TESTING) return true;

    return (
      selectedYear < actualCurrentYear ||
      (selectedYear === actualCurrentYear &&
        selectedMonth < actualCurrentMonth)
    );
  }

  function handleNextMonth() {
    if (!canMoveToNextMonth()) return;

    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((year) => year + 1);
    } else {
      setSelectedMonth((month) => month + 1);
    }
  }

  function isSelectedMonthCurrent() {
    return (
      selectedMonth === actualCurrentMonth &&
      selectedYear === actualCurrentYear
    );
  }

  const isViewingFutureMonth =
    selectedYear > actualCurrentYear ||
    (selectedYear === actualCurrentYear &&
      selectedMonth > actualCurrentMonth);


  // Spending handlers
  async function handleAddSpending() {
    if (!txnAmount || isNaN(txnAmount) || parseFloat(txnAmount) <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid amount.");
      return;
    }

    if (!txnCategory) {
      Alert.alert("Missing Category", "Select a category.");
      return;
    }

    if (txnCategory === "Other" && !txnName.trim()) {
      Alert.alert("Missing Description", "Please describe this spending.");
      return;
    }

    if (!txnDate.trim() && !isSelectedMonthCurrent()) {
      Alert.alert(
        "Date Required",
        `Enter a date in ${getMonthName(selectedMonth)} ${selectedYear} for this spending.`
      );
      return;
    }

    if (txnDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const value = txnDate.trim();

      if (!dateRegex.test(value)) {
        Alert.alert("Invalid Date", "Use format YYYY-MM-DD.");
        return;
      }

      const [year, month, day] = value.split("-").map(Number);
      const parsedDate = new Date(year, month - 1, day);

      const isValidDate =
        parsedDate.getFullYear() === year &&
        parsedDate.getMonth() + 1 === month &&
        parsedDate.getDate() === day;

      if (!isValidDate) {
        Alert.alert("Invalid Date", "Enter a valid calendar date.");
        return;
      }

      if (month !== selectedMonth || year !== selectedYear) {
        Alert.alert(
          "Wrong Month",
          `This Tracker view is for ${getMonthName(selectedMonth)} ${selectedYear}. Enter a date within this month.`
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      const data = {
        name: txnName.trim() || txnCategory,
        amount: parseFloat(txnAmount),
        category: txnCategory,
        type: "expense",
        is_recurring: false,
      };

      if (txnDate.trim()) {
        data.date = txnDate.trim();
      }

      await createTransaction(data);
      clearSimulatorDraft();

      resetSpendingForm();
      setSpendingModalVisible(false);
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to add spending.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetSpendingForm() {
    setTxnAmount("");
    setTxnCategory("");
    setTxnName("");
    setTxnDate("");
  }


  // Bill handlers
  async function handleUpdateBillStatus(billId, status) {
    try {
      await updateBill(billId, status);
      clearSimulatorDraft();

      setBillStatusModalVisible(false);
      setSelectedBill(null);

      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to update bill.");
    }
  }

  async function handleAddBill() {
    if (!newBillName.trim()) {
      Alert.alert("Missing Field", "Enter a bill name.");
      return;
    }

    if (
      !newBillAmount ||
      isNaN(newBillAmount) ||
      parseFloat(newBillAmount) <= 0
    ) {
      Alert.alert("Invalid Amount", "Enter a valid amount.");
      return;
    }

    if (
      !newBillDueDay ||
      isNaN(newBillDueDay) ||
      parseInt(newBillDueDay) < 1 ||
      parseInt(newBillDueDay) > 31
    ) {
      Alert.alert("Invalid Due Day", "Enter a day between 1 and 31.");
      return;
    }

    try {
      const dueDate = `${selectedYear}-${String(selectedMonth).padStart(
        2,
        "0"
      )}-${String(parseInt(newBillDueDay)).padStart(2, "0")}`;

      await createBill({
        name: newBillName.trim(),
        amount: parseFloat(newBillAmount),
        due_date: dueDate,
        status: "upcoming",
      });
      clearSimulatorDraft();

      resetBillForm();
      setAddBillModalVisible(false);
      await loadData();
    } catch (error) {
      Alert.alert("Error", "Failed to add bill.");
    }
  }

  function resetBillForm() {
    setNewBillName("");
    setNewBillAmount("");
    setNewBillDueDay("");
  }

  async function handleStopTrackingBill(billId) {
    Alert.alert(
      "Stop tracking this bill?",
      "This bill will no longer appear in the upcoming months. Past paid, late, or missed bills will still be kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop Tracking",
          style: "destructive",
          onPress: async () => {
            try {
              await stopTrackingBill(billId);
              clearSimulatorDraft();
              setBillStatusModalVisible(false);
              setSelectedBill(null);
              await loadData();
            } catch (error) {
              Alert.alert("Error", "Failed to stop tracking bill.");
            }
          },
        },
      ]
    );
  }

  async function handleDeleteBillHistory(billId) {
    Alert.alert(
      "Delete all bill history?",
      "This will remove this bill from all months. This may affect your Trust Score. Proceed only if the bill was added by mistake.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteBillHistory(billId);
              clearSimulatorDraft();
              setBillStatusModalVisible(false);
              setSelectedBill(null);
              await loadData();
            } catch (error) {
              Alert.alert("Error", "Failed to delete bill history.");
            }
          },
        },
      ]
    );
  }

  
  // Helpers
  function getMonthName(month) {
    return [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][month - 1];
  }

  function getRatioGradeColor(grade) {
  switch (grade) {
    case "A":
      return COLORS.componentA;
    case "B":
      return COLORS.componentB;
    case "C":
      return COLORS.componentC;
    case "D":
      return COLORS.componentD;
    case "F":
      return COLORS.componentF;
    default:
      return COLORS.textMuted;
  }
}

  function getTodayFormatted() {
    const today = new Date();

    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
  }

  function formatBillDueDate(dateString) {
    if (!dateString) {
      return "";
    }

    const [year, month, day] = dateString.split("-").map(Number);

    const monthName = new Date(year, month - 1, day).toLocaleString("en-SG", {
      month: "short",
    });

    return `${day} ${monthName}`;
  }

  function getBillStatusColor(status) {
    switch (status) {
      case "paid_on_time":
        return COLORS.accent;
      case "late":
        return COLORS.warning;
      case "missed":
        return COLORS.danger;
      default:
        return COLORS.blue;
    }
  }

  function getBillStatusLabel(status) {
    switch (status) {
      case "paid_on_time":
        return "Paid";
      case "late":
        return "Late";
      case "missed":
        return "Missed";
      default:
        return "Upcoming";
    }
  }

  function getSpendingDisplayName(transaction) {
    if (transaction.is_recurring && transaction.name?.startsWith("Bill: ")) {
      return transaction.name.replace("Bill: ", "");
    }

    return transaction.name;
  }

  function getSpendingDisplayCategory(transaction) {
    if (transaction.is_recurring) {
      return "Bill payment";
    }

    return transaction.category;
  }


  // Data from backend
  const monthlyIncome = overview?.monthly_income || 0;
  const totalExpenses = overview?.total_expenses || 0;
  const totalSaved = overview?.total_saved || 0;

  const bills = overview?.bills || [];
  const billsPaidOnTime = overview?.bills_paid_on_time || 0;
  const billsTotal = overview?.bills_total_resolved || 0;
  const billsUpcoming = overview?.bills_upcoming || 0;

  const categories = overview?.categories || [];
  const transactions = overview?.recent_transactions || [];

  const spendingRatio = overview?.spending_ratio || 0;
  const ratioGrade = overview?.ratio_grade || "D";
  const ratioMessage = overview?.ratio_message || "";

  const spendingTransactions = transactions.filter(
    (transaction) => transaction.type === "expense"
  );

  const hasTrackedSpending = totalExpenses > 0;
  const spendingRatioColor = getRatioGradeColor(ratioGrade);

  if (loading) {
    return (
      <View style={[COMMON.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={COMMON.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
          />
        }
      >
        {/* Header */}
        <Text style={styles.title}>Tracker</Text>

        <View style={styles.monthNavigation}>
          <TouchableOpacity
            style={styles.monthArrowButton}
            onPress={handlePreviousMonth}
          >
            <Text style={styles.monthArrowText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.monthTitleContainer}>
            <Text style={styles.subtitle}>
              {getMonthName(selectedMonth)} {selectedYear}
            </Text>

            {isViewingFutureMonth && ALLOW_FUTURE_MONTH_TESTING && (
              <Text style={styles.testingMonthText}>Testing future month</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.monthArrowButton,
              !canMoveToNextMonth() && styles.monthArrowDisabled,
            ]}
            onPress={handleNextMonth}
            disabled={!canMoveToNextMonth()}
          >
            <Text
              style={[
                styles.monthArrowText,
                !canMoveToNextMonth() && styles.monthArrowTextDisabled,
              ]}
            >
              ›
            </Text>
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View
            style={[
              styles.summaryCard,
              { borderColor: COLORS.accent + "44" },
            ]}
          >
            <Text style={styles.summaryLabel}>Income /{"\n"}Allowance</Text>
            <Text style={[styles.summaryValue, { color: COLORS.accent }]}>
              ${monthlyIncome.toFixed(0)}
            </Text>
          </View>

          <View
            style={[
              styles.summaryCard,
              { borderColor: COLORS.warning + "44" },
            ]}
          >
            <Text style={styles.summaryLabel}>Total{"\n"}Spending</Text>
            <Text style={[styles.summaryValue, { color: COLORS.warning }]}>
              ${totalExpenses.toFixed(2)}
            </Text>
          </View>

          <View
            style={[
              styles.summaryCard,
              { borderColor: COLORS.blue + "44" },
            ]}
          >
            <Text style={styles.summaryLabel}>Estimated{"\n"}Savings</Text>
            <Text style={[styles.summaryValue, { color: COLORS.blue }]}>
              {hasTrackedSpending ? `$${totalSaved.toFixed(0)}` : "—"}
            </Text>
          </View>
        </View>

        {/* Income warning */}
        {monthlyIncome === 0 && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              Set your monthly income or allowance in Settings for accurate
              tracking.
            </Text>
          </View>
        )}

        {/* Tab Toggle */}
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "spending" && styles.tabActive,
            ]}
            onPress={() => setActiveTab("spending")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "spending" && styles.tabTextActive,
              ]}
            >
              Spending
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === "bills" && styles.tabActive]}
            onPress={() => setActiveTab("bills")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "bills" && styles.tabTextActive,
              ]}
            >
              Bills {billsUpcoming > 0 && `(${billsUpcoming})`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spending Tab */}
        {activeTab === "spending" && (
          <>
            {/* Spending by Category */}
            {categories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Spending by Category</Text>

                {categories.map((category, index) => (
                  <View key={index} style={styles.categoryRow}>
                    <View style={styles.categoryInfo}>
                      <Text style={styles.categoryName}>
                        {category.category}
                      </Text>

                      <Text style={styles.categoryAmount}>
                        ${parseFloat(category.total_spent).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Spending Ratio */}
            {monthlyIncome > 0 && totalExpenses > 0 && (
              <View style={styles.ratioCard}>
                <Text style={styles.ratioTitle}>
                  Spending-to-Income Ratio
                </Text>

                <Text style={[styles.ratioValue, { color: spendingRatioColor }]}>
                  {spendingRatio}%
                </Text>

                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${Math.min(spendingRatio, 100)}%`,
                        backgroundColor: spendingRatioColor,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.ratioHint}>{ratioMessage}</Text>
              </View>
            )}

            {/* Recent Spending */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Spending</Text>

              {spendingTransactions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    No spending logged this month.
                  </Text>
                  <Text style={styles.emptySubtext}>
                    Tap + to log your first spending.
                  </Text>
                </View>
              ) : (
                spendingTransactions.slice(0, 20).map((transaction, index) => (
                  <TouchableOpacity
                    key={transaction.id || index}
                    style={styles.txnRow}
                    onLongPress={() => {
                      if (transaction.is_recurring) {
                        Alert.alert(
                          "Managed through Bills",
                          "This spending was created from a bill payment. Update or delete the bill from the Bills tab instead."
                        );
                        return;
                      }

                      Alert.alert(
                        "Delete Spending",
                        `Remove "${transaction.name}" - $${parseFloat(
                          transaction.amount
                        ).toFixed(2)}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: async () => {
                              try {
                                await deleteTransaction(transaction.id);
                                clearSimulatorDraft();
                                await loadData();
                              } catch (error) {
                                Alert.alert(
                                  "Error",
                                  "Failed to delete spending."
                                );
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <View
                      style={[
                        styles.txnIcon,
                        transaction.is_recurring && {
                          backgroundColor: COLORS.accentDim,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.txnIconText,
                          transaction.is_recurring && {
                            color: COLORS.accent,
                          },
                        ]}
                      >
                        {transaction.is_recurring
                          ? "↻"
                          : transaction.category
                          ? transaction.category[0]
                          : "$"}
                      </Text>
                    </View>

                    <View style={styles.txnInfo}>
                      <Text style={styles.txnName}>
                        {getSpendingDisplayName(transaction)}
                      </Text>

                      <Text style={styles.txnMeta}>
                        {formatBillDueDate(transaction.date)} ·{" "}
                        {getSpendingDisplayCategory(transaction)}
                      </Text>
                    </View>

                    <Text style={styles.txnAmount}>
                      -${parseFloat(transaction.amount).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}

        {/* Bills Tab */}
        {activeTab === "bills" && (
          <View style={styles.section}>
            {/* Bill Stats */}
            {billsTotal > 0 && (
              <View style={styles.billStatsCard}>
                <View style={styles.billStatItem}>
                  <Text style={[styles.billStatValue, { color: COLORS.accent }]}>
                    {billsPaidOnTime}
                  </Text>
                  <Text style={styles.billStatLabel}>On Time</Text>
                </View>

                <View style={styles.billStatDivider} />

                <View style={styles.billStatItem}>
                  <Text
                    style={[styles.billStatValue, { color: COLORS.warning }]}
                  >
                    {bills.filter((bill) => bill.status === "late").length}
                  </Text>
                  <Text style={styles.billStatLabel}>Late</Text>
                </View>

                <View style={styles.billStatDivider} />

                <View style={styles.billStatItem}>
                  <Text style={[styles.billStatValue, { color: COLORS.danger }]}>
                    {bills.filter((bill) => bill.status === "missed").length}
                  </Text>
                  <Text style={styles.billStatLabel}>Missed</Text>
                </View>

                <View style={styles.billStatDivider} />

                <View style={styles.billStatItem}>
                  <Text style={[styles.billStatValue, { color: COLORS.blue }]}>
                    {billsUpcoming}
                  </Text>
                  <Text style={styles.billStatLabel}>Upcoming</Text>
                </View>
              </View>
            )}

            {billsUpcoming > 0 && (
              <View style={styles.reminderCard}>
                <Text style={styles.reminderText}>
                  {billsUpcoming} bill{billsUpcoming > 1 ? "s" : ""} pending
                  {" — "}tap to update payment status
                </Text>
              </View>
            )}

            {/* Add Bill */}
            <TouchableOpacity
              style={styles.addBillButton}
              onPress={() => setAddBillModalVisible(true)}
            >
              <Text style={styles.addBillText}>+ Add Bill</Text>
            </TouchableOpacity>

            {/* Bill List */}
            {bills.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No bills added yet.</Text>
                <Text style={styles.emptySubtext}>
                  Add bills to track payment consistency.
                </Text>
              </View>
            ) : (
              bills.map((bill) => {
                const statusColor = getBillStatusColor(bill.status);
                const statusLabel = getBillStatusLabel(bill.status);
                const isUpcoming = bill.status === "upcoming";

                return (
                  <TouchableOpacity
                    key={bill.id}
                    style={[
                      styles.billCard,
                      isUpcoming && styles.billCardUpcoming,
                    ]}
                    onPress={() => {
                      setSelectedBill(bill);
                      setBillStatusModalVisible(true);
                    }}
                  >
                    <View style={styles.billInfo}>
                      <Text style={styles.billName}>{bill.name}</Text>

                      <Text style={styles.billAmount}>
                        ${parseFloat(bill.amount).toFixed(2)}
                      </Text>

                      <Text style={styles.billDueDate}>
                        Due {formatBillDueDate(bill.due_date)}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.billStatusBadge,
                        { backgroundColor: statusColor + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.billStatusText,
                          { color: statusColor },
                        ]}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Floating Add Button - Spending tab only */}
      {activeTab === "spending" && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setSpendingModalVisible(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add Spending Modal */}
      <Modal
        visible={spendingModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSpendingModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <ScrollView
                style={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalTitle}>Log Spending</Text>

                <Text style={styles.modalLabel}>Amount</Text>
                <TextInput
                  style={COMMON.textInput}
                  placeholder="$0.00"
                  placeholderTextColor={COLORS.textMuted}
                  value={txnAmount}
                  onChangeText={setTxnAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.modalLabel}>Category</Text>
                <View style={styles.chipGrid}>
                  {SPENDING_CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.chip,
                        txnCategory === category && styles.chipSelected,
                      ]}
                      onPress={() => {
                        setTxnCategory(category);
                        Keyboard.dismiss();
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          txnCategory === category && styles.chipTextSelected,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>
                  {txnCategory === "Other"
                    ? "Description"
                    : "Description (optional)"}
                </Text>

                <TextInput
                  style={COMMON.textInput}
                  placeholder={
                    txnCategory === "Other"
                      ? "e.g. Doctor visit"
                      : "e.g. Chicken rice, Grab"
                  }
                  placeholderTextColor={COLORS.textMuted}
                  value={txnName}
                  onChangeText={setTxnName}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {txnCategory === "Other" && (
                  <Text style={styles.fieldHint}>
                    Required when Other is selected.
                  </Text>
                )}

                <Text style={styles.modalLabel}>
                  Date {isSelectedMonthCurrent() ? "(optional)" : "(required)"}
                </Text>
                <TextInput
                  style={COMMON.textInput}
                  placeholder={
                    isSelectedMonthCurrent()
                      ? `Default: today (${getTodayFormatted()})`
                      : `e.g. ${selectedYear}-${String(selectedMonth).padStart(
                          2,
                          "0"
                        )}-15`
                  }
                  placeholderTextColor={COLORS.textMuted}
                  value={txnDate}
                  onChangeText={setTxnDate}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      resetSpendingForm();
                      setSpendingModalVisible(false);
                    }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      COMMON.button,
                      COMMON.buttonPrimary,
                      styles.saveBtn,
                      submitting && styles.disabled,
                    ]}
                    onPress={handleAddSpending}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color={COLORS.bg} />
                    ) : (
                      <Text style={COMMON.buttonText}>Add</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Bill Status Modal */}
      <Modal
        visible={billStatusModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setBillStatusModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setBillStatusModalVisible(false)}
        >
          <View style={styles.centerModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.centerModalContent}>
                {selectedBill && (
                  <>
                    <View style={styles.billModalHeader}>
                      <Text style={styles.centerModalTitle}>Bill Details</Text>

                      <TouchableOpacity
                        style={styles.closeIconButton}
                        onPress={() => setBillStatusModalVisible(false)}
                        accessibilityLabel="Close bill details"
                      >
                        <Text style={styles.closeIconText}>×</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.selectedBillSummary}>
                      <Text style={styles.selectedBillName}>
                        {selectedBill.name}
                      </Text>

                      <Text style={styles.centerModalSub}>
                        ${parseFloat(selectedBill.amount).toFixed(2)} · Due{" "}
                        {formatBillDueDate(selectedBill.due_date)}
                      </Text>
                    </View>

                    <View style={styles.billModalSection}>
                      <Text style={styles.centerModalQuestion}>
                        Payment Status
                      </Text>

                      <View style={styles.statusList}>
                        {STATUS_OPTIONS.map((option) => {
                          const isSelected = selectedBill.status === option.value;

                          return (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.statusListRow,
                                isSelected && styles.statusListRowSelected,
                              ]}
                              onPress={() =>
                                handleUpdateBillStatus(selectedBill.id, option.value)
                              }
                            >
                              <Text
                                style={[
                                  styles.statusListText,
                                  isSelected && styles.statusListTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>

                              {isSelected && (
                                <Text style={styles.currentStatusText}>
                                  Current
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.billModalSection}>
                      <Text style={styles.manageBillLabel}>Manage Bill</Text>

                      <TouchableOpacity
                        style={styles.stopTrackingBillRow}
                        onPress={() => handleStopTrackingBill(selectedBill.id)}
                      >
                        <Text style={styles.stopTrackingBillText}>
                          Stop Tracking
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deleteBillHistoryRow}
                        onPress={() => handleDeleteBillHistory(selectedBill.id)}
                      >
                        <Text style={styles.deleteBillHistoryText}>
                          Delete All History
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Add Bill Modal */}
      <Modal
        visible={addBillModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddBillModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <ScrollView
                style={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalTitle}>Add Recurring Bill</Text>

                <Text style={styles.modalLabel}>Bill Name</Text>
                <TextInput
                  style={COMMON.textInput}
                  placeholder="e.g. Netflix, Phone Plan"
                  placeholderTextColor={COLORS.textMuted}
                  value={newBillName}
                  onChangeText={setNewBillName}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.modalLabel}>Amount</Text>
                <TextInput
                  style={COMMON.textInput}
                  placeholder="$0.00"
                  placeholderTextColor={COLORS.textMuted}
                  value={newBillAmount}
                  onChangeText={setNewBillAmount}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.modalLabel}>Due Day</Text>
                <TextInput
                  style={COMMON.textInput}
                  placeholder="e.g. 13"
                  placeholderTextColor={COLORS.textMuted}
                  value={newBillDueDay}
                  onChangeText={setNewBillDueDay}
                  keyboardType="number-pad"
                  maxLength={2}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.fieldHint}>
                  This bill repeats monthly from {getMonthName(selectedMonth)}{" "}
                  {selectedYear}.
                </Text>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      resetBillForm();
                      setAddBillModalVisible(false);
                    }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      COMMON.button,
                      COMMON.buttonPrimary,
                      styles.saveBtn,
                    ]}
                    onPress={handleAddBill}
                  >
                    <Text style={COMMON.buttonText}>Add</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.xl,
    paddingBottom: 100,
    paddingTop: SPACING.xxl + 20,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },

  subtitle: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
  },

  monthNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
  },

  monthTitleContainer: {
    alignItems: "center",
  },

  monthArrowButton: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  monthArrowDisabled: {
    opacity: 0.4,
  },

  monthArrowText: {
    fontSize: 28,
    lineHeight: 30,
    color: COLORS.text,
  },

  monthArrowTextDisabled: {
    color: COLORS.textMuted,
  },

  testingMonthText: {
    fontSize: FONTS.xs,
    color: COLORS.warning,
    marginTop: 2,
  },

  // Summary
  summaryRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    alignItems: "center",
  },

  summaryLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
    textAlign: "center",
    lineHeight: 16,
  },

  summaryValue: {
    fontSize: FONTS.base,
    fontWeight: "700",
  },

  warningCard: {
    backgroundColor: COLORS.warningDim,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.warning + "33",
  },

  warningText: {
    fontSize: FONTS.sm,
    color: COLORS.warning,
    textAlign: "center",
  },

  // Tabs
  tabToggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 4,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    borderRadius: RADIUS.sm,
  },

  tabActive: {
    backgroundColor: COLORS.accent,
  },

  tabText: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.textDim,
  },

  tabTextActive: {
    color: COLORS.bg,
  },

  // Sections
  section: {
    marginBottom: SPACING.lg,
  },

  sectionTitle: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },

  // Categories
  categoryRow: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  categoryInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },

  categoryName: {
    fontSize: FONTS.md,
    fontWeight: "500",
    color: COLORS.text,
  },

  categoryAmount: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },

  progressBarContainer: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },

  progressBar: {
    height: "100%",
    borderRadius: RADIUS.full,
  },

  // Ratio
  ratioCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  ratioTitle: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
  },

  ratioValue: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    marginBottom: SPACING.sm,
  },

  ratioHint: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginTop: SPACING.sm,
  },

  // Transactions
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },

  txnIconText: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.textDim,
  },

  txnInfo: {
    flex: 1,
  },

  txnName: {
    fontSize: FONTS.md,
    fontWeight: "500",
    color: COLORS.text,
  },

  txnMeta: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  txnAmount: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
  },

  // Bills
  billStatsCard: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },

  billStatItem: {
    flex: 1,
    alignItems: "center",
  },

  billStatValue: {
    fontSize: FONTS.xl,
    fontWeight: "700",
  },

  billStatLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginTop: 2,
  },

  billStatDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  reminderCard: {
    backgroundColor: COLORS.warningDim,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },

  reminderText: {
    fontSize: FONTS.xs,
    color: COLORS.warning,
    textAlign: "center",
  },

  addBillButton: {
    padding: SPACING.sm,
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.accent + "44",
    borderStyle: "dashed",
    marginBottom: SPACING.md,
  },

  addBillText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.accent,
  },

  billCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  billCardUpcoming: {
    borderColor: COLORS.blue + "44",
  },

  billInfo: {
    flex: 1,
    marginRight: SPACING.sm,
  },

  billName: {
    fontSize: FONTS.md,
    fontWeight: "500",
    color: COLORS.text,
  },

  billAmount: {
    fontSize: FONTS.sm,
    fontWeight: "500",
    color: COLORS.text,
    marginTop: SPACING.xs,
  },

  billDueDate: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginTop: 2,
  },

  billStatusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },

  billStatusText: {
    fontSize: FONTS.xs,
    fontWeight: "600",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.xxl,
  },

  emptyText: {
    fontSize: FONTS.md,
    color: COLORS.textDim,
  },

  emptySubtext: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    textAlign: "center",
  },

  // Floating action button
  fab: {
    position: "absolute",
    bottom: 90,
    right: SPACING.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  fabText: {
    fontSize: 28,
    fontWeight: "600",
    color: COLORS.bg,
    marginTop: -2,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },

  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: "85%",
    marginTop: "auto",
  },

  modalTitle: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },

  modalLabel: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },

  fieldHint: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },

  modalButtons: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.xl,
  },

  centerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },

  centerModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: "100%",
  },

  billModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },

  centerModalTitle: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
  },

  closeIconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  closeIconText: {
    fontSize: 28,
    color: COLORS.textMuted,
    lineHeight: 30,
  },

  selectedBillSummary: {
    marginBottom: 0,
  },

  selectedBillName: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },

  centerModalSub: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },

  billModalSection: {
    marginTop: SPACING.lg,
  },

  centerModalQuestion: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  manageBillLabel: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  statusList: {
    gap: SPACING.sm,
  },

  statusListRow: {
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  statusListRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },

  statusListText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  statusListTextSelected: {
    color: COLORS.accent,
  },

  currentStatusText: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: COLORS.accent,
  },

  stopTrackingBillRow: {
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },

  stopTrackingBillText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  deleteBillHistoryRow: {
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + "66",
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  deleteBillHistoryText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.danger,
  },

  // Chips
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },

  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  chipSelected: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },

  chipText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },

  chipTextSelected: {
    color: COLORS.accent,
    fontWeight: "600",
  },

  // Buttons
  cancelBtn: {
    flex: 1,
    padding: SPACING.base,
    alignItems: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cancelBtnText: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.textDim,
  },

  saveBtn: {
    flex: 1,
  },

  disabled: {
    opacity: 0.6,
  },
});
