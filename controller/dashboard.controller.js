const User = require('../models/user.model');
const Subscribe = require('../models/Subscribe.model');
const Movie = require('../models/movie.model');
const Payment = require('../models/payment.model');
const Premium = require('../models/premium.Model');

exports.dashboard = async (req, res) => {
    try {
        // Get filter from query, default to 'all'
        const filter = req.query.filter || 'all';
        let dateFilter = {};

        if (filter !== 'all') {
            const now = new Date();
            let start, end;
            if (filter === 'today') {
                start = new Date(now.setHours(0, 0, 0, 0));
                end = new Date(now.setHours(23, 59, 59, 999));
            } else if (filter === 'month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (filter === 'year') {
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            }
            dateFilter = { createdAt: { $gte: start, $lte: end } };
        }

        // Total Users
        const totalUsers = await User.countDocuments(dateFilter);

        // Total Subscribers (assuming Subscribe model has userId and isActive)
        const totalSubscribers = await Subscribe.countDocuments({ ...dateFilter, subscribe: true });

        // Total Soon to Expire (e.g., subscriptions expiring in next 7 days)
        const soonExpireDate = new Date();
        soonExpireDate.setDate(soonExpireDate.getDate() + 7);
        const soonExpireFilter = {
            endDate: { $lte: soonExpireDate, $gte: new Date() }, // Changed from expiryDate to endDate and using User model
            ...dateFilter
        };
        const totalSoonToExpire = await User.countDocuments(soonExpireFilter);

        // Aggregate to sum the 'amount' field of all Payment documents
        const result = await Payment.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$amount" }
                }
            }
        ]);

        // If there are no payments, totalRevenue will be 0
        const totalRevenue = result[0]?.totalRevenue || 0;

        return res.status(200).json({
            data: {
                totalUsers,
                totalSubscribers,
                totalSoonToExpire,
                totalRevenue,
            },
            status: 200,
            message: "Dashboard data fetched successfully"
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.topCategories = async (req, res) => {
    try {
        // Get filter from query, default to 'all'
        const filter = req.query.filter || 'all';
        let dateFilter = {};

        if (filter !== 'all') {
            const now = new Date();
            let start, end;
            if (filter === 'today') {
                start = new Date(now.setHours(0, 0, 0, 0));
                end = new Date(now.setHours(23, 59, 59, 999));
            } else if (filter === 'month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (filter === 'year') {
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            }
            dateFilter = { createdAt: { $gte: start, $lte: end } };
        }

        const totalMovies = await Movie.countDocuments(dateFilter);

        const categories = await Movie.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: "$category", // category is ObjectId
                    count: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "moviecategories", // collection name in MongoDB (usually lowercase plural)
                    localField: "_id",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData"
            },
            {
                $project: {
                    _id: 0,
                    categoryId: "$_id",
                    count: 1,
                    percentage: {
                        $cond: [
                            { $eq: [totalMovies, 0] },
                            0,
                            { $round: [{ $multiply: [{ $divide: ["$count", totalMovies] }, 100] }, 2] }
                        ]
                    },
                    category: "$categoryData" // this will include all category fields
                }
            }
        ]);

        return res.status(200).json({
            data: categories,
            status: 200,
            message: "Top categories fetched successfully"
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.totalRevenue = async (req, res) => {
    try {
        const filter = req.query.filter;
        let start, end;
        const now = new Date();
        let data = [];
        let message = '';

        if (filter === 'today') {
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(now.setHours(23, 59, 59, 999));
            // Aggregate revenue by hour for today
            const result = await Payment.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: { hour: { $hour: "$createdAt" } },
                        totalRevenue: { $sum: "$amount" }
                    }
                },
                {
                    $sort: { "_id.hour": 1 }
                }
            ]);
            data = Array.from({ length: 24 }, (_, idx) => {
                const found = result.find(item => item._id.hour === idx + 1); // Adjusted to start from 1
                // Format hour as 2-digit string (e.g., '01', '02', ... '24')
                const label = (idx + 1).toString().padStart(2, '0'); // Adjusted to start from 1
                return {
                    label,
                    revenue: found ? found.totalRevenue : 0
                };
            });
            message = "Hourly revenue for today fetched successfully";
        } else if (filter === 'month') {
            const year = parseInt(req.query.year) || now.getFullYear();
            const month = parseInt(req.query.month) || (now.getMonth() + 1); // 1-based
            start = new Date(year, month - 1, 1);
            end = new Date(year, month, 0, 23, 59, 59, 999);
            // Aggregate revenue by day of month
            const result = await Payment.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: { day: { $dayOfMonth: "$createdAt" } },
                        totalRevenue: { $sum: "$amount" }
                    }
                },
                {
                    $sort: { "_id.day": 1 }
                }
            ]);
            const daysInMonth = new Date(year, month, 0).getDate();
            data = Array.from({ length: daysInMonth }, (_, idx) => {
                const found = result.find(item => item._id.day === idx + 1);
                const day = idx + 1;
                const date = new Date(year, month - 1, day + 1);
                const label = date.toISOString().slice(0, 10); // YYYY-MM-DD
                return {
                    label,
                    revenue: found ? found.totalRevenue : 0
                };
            });
            message = "Daily revenue for this month fetched successfully";
        } else if (filter === 'all') {
            // Find the first and last payment to determine the year span
            const firstPayment = await Payment.findOne({}).sort({ createdAt: 1 });
            const lastPayment = await Payment.findOne({}).sort({ createdAt: -1 });

            if (!firstPayment || !lastPayment) {
                return res.status(200).json({ data: [], status: 200, message: 'No payment data found' });
            }

            const firstYear = new Date(firstPayment.createdAt).getFullYear();
            const lastYear = new Date(lastPayment.createdAt).getFullYear();

            if (firstYear !== lastYear) {
                // Group by year
                const result = await Payment.aggregate([
                    {
                        $group: {
                            _id: { year: { $year: "$createdAt" } },
                            totalRevenue: { $sum: "$amount" }
                        }
                    },
                    { $sort: { "_id.year": 1 } }
                ]);
                data = result.map(item => ({
                    label: item._id.year.toString(),
                    revenue: item.totalRevenue
                }));
                message = "Yearly revenue for all time fetched successfully";
            } else {
                // Group by month for that year
                const year = firstYear;
                start = new Date(year, 0, 1);
                end = new Date(year, 11, 31, 23, 59, 59, 999);

                const result = await Payment.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: start, $lte: end }
                        }
                    },
                    {
                        $group: {
                            _id: { month: { $month: "$createdAt" } },
                            totalRevenue: { $sum: "$amount" }
                        }
                    },
                    { $sort: { "_id.month": 1 } }
                ]);
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                data = monthNames.map((name, idx) => {
                    const found = result.find(item => item._id.month === idx + 1);
                    return {
                        label: name,
                        revenue: found ? found.totalRevenue : 0
                    };
                });
                message = "Monthly revenue for the only available year fetched successfully";
            }
        } else {
            // Default to year
            const year = now.getFullYear();
            start = new Date(year, 0, 1);
            end = new Date(year, 11, 31, 23, 59, 59, 999);
            const result = await Payment.aggregate([
                {
                    $match: {
                        createdAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: { month: { $month: "$createdAt" } },
                        totalRevenue: { $sum: "$amount" }
                    }
                },
                {
                    $sort: { "_id.month": 1 }
                }
            ]);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            data = monthNames.map((name, idx) => {
                const found = result.find(item => item._id.month === idx + 1);
                return {
                    label: name,
                    revenue: found ? found.totalRevenue : 0
                };
            });
            message = "Monthly revenue for this year fetched successfully";
        }

        return res.status(200).json({
            data,
            status: 200,
            message
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.newSubscribersByPlan = async (req, res) => {
    try {
        const filter = req.query.filter;
        const now = new Date();
        const plans = await Premium.find();
        const planIdToName = {};
        plans.forEach(plan => {
            planIdToName[plan._id.toString()] = plan.plan;
        });
        const planNames = plans.map(plan => plan.plan);

        let groupStage, labelFormatter, labels, matchStage = { planId: { $ne: null } };
        let message = '';

        if (filter === 'today') {
            // Hourly for today
            const start = new Date(now.setHours(0, 0, 0, 0));
            const end = new Date(now.setHours(23, 59, 59, 999));
            matchStage = { ...matchStage, createdAt: { $gte: start, $lte: end } };
            groupStage = {
                _id: { hour: { $hour: "$createdAt" }, planId: "$planId" },
                count: { $sum: 1 }
            };
            labelFormatter = doc => doc._id.hour.toString().padStart(2, '0');
            labels = Array.from({ length: 24 }, (_, idx) => idx.toString().padStart(2, '0'));
            message = "Hourly new subscribers by plan for today";
        } else if (filter === 'month') {
            // Daily for month
            const year = parseInt(req.query.year) || now.getFullYear();
            const month = parseInt(req.query.month) || (now.getMonth() + 1);
            const daysInMonth = new Date(year, month, 0).getDate();
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59, 999);
            matchStage = { ...matchStage, createdAt: { $gte: start, $lte: end } };
            groupStage = {
                _id: { day: { $dayOfMonth: "$createdAt" }, planId: "$planId" },
                count: { $sum: 1 }
            };
            labelFormatter = doc => {
                const day = doc._id.day;
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            };
            labels = Array.from({ length: daysInMonth }, (_, idx) => {
                const day = idx + 1;
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            });
            message = `Daily new subscribers by plan for ${year}-${month.toString().padStart(2, '0')}`;
        } else if (filter === 'year') {
            // Monthly for year
            const year = parseInt(req.query.year) || now.getFullYear();
            const start = new Date(year, 0, 1);
            const end = new Date(year, 11, 31, 23, 59, 59, 999);
            matchStage = { ...matchStage, createdAt: { $gte: start, $lte: end } };
            groupStage = {
                _id: { month: { $month: "$createdAt" }, planId: "$planId" },
                count: { $sum: 1 }
            };
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            labelFormatter = doc => monthNames[(doc._id.month || 1) - 1];
            labels = monthNames;
            message = `Monthly new subscribers by plan for year ${year}`;
        } else if (filter === 'all') {
            // Find min/max year
            const firstPayment = await Payment.findOne({ planId: { $ne: null } }).sort({ createdAt: 1 });
            const lastPayment = await Payment.findOne({ planId: { $ne: null } }).sort({ createdAt: -1 });
            if (!firstPayment || !lastPayment) {
                return res.status(200).json({ data: [], status: 200, message: 'No subscribers found' });
            }
            const firstYear = new Date(firstPayment.createdAt).getFullYear();
            const lastYear = new Date(lastPayment.createdAt).getFullYear();
            if (firstYear !== lastYear) {
                // Group by year
                groupStage = {
                    _id: { year: { $year: "$createdAt" }, planId: "$planId" },
                    count: { $sum: 1 }
                };
                labelFormatter = doc => doc._id.year.toString();
                labels = [];
                for (let y = firstYear; y <= lastYear; y++) {
                    labels.push(y.toString());
                }
                message = 'Yearly new subscribers by plan for all years';
            } else {
                // Group by month for that year
                const year = firstYear;
                groupStage = {
                    _id: { month: { $month: "$createdAt" }, planId: "$planId" },
                    count: { $sum: 1 }
                };
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                labelFormatter = doc => monthNames[(doc._id.month || 1) - 1];
                labels = monthNames;
                message = `Monthly new subscribers by plan for the only available year (${year})`;
            }
        } else {
            // Auto: year if >1 year, else month
            const firstPayment = await Payment.findOne({ planId: { $ne: null } }).sort({ createdAt: 1 });
            const lastPayment = await Payment.findOne({ planId: { $ne: null } }).sort({ createdAt: -1 });
            if (!firstPayment || !lastPayment) {
                return res.status(200).json({ data: [], status: 200, message: 'No subscribers found' });
            }
            const firstDate = new Date(firstPayment.createdAt);
            const lastDate = new Date(lastPayment.createdAt);
            const diffYears = lastDate.getFullYear() - firstDate.getFullYear();
            if (diffYears >= 1) {
                groupStage = {
                    _id: { year: { $year: "$createdAt" }, planId: "$planId" },
                    count: { $sum: 1 }
                };
                labelFormatter = doc => doc._id.year.toString();
                labels = [];
                for (let y = firstDate.getFullYear(); y <= lastDate.getFullYear(); y++) {
                    labels.push(y.toString());
                }
                message = 'Yearly new subscribers by plan (auto)';
            } else {
                groupStage = {
                    _id: { month: { $month: "$createdAt" }, planId: "$planId" },
                    count: { $sum: 1 }
                };
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                labelFormatter = doc => monthNames[(doc._id.month || 1) - 1];
                labels = monthNames;
                message = 'Monthly new subscribers by plan (auto)';
            }
        }

        // Aggregate
        const result = await Payment.aggregate([
            { $match: matchStage },
            { $group: groupStage },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 } }
        ]);

        // Build chart data
        const chartData = labels.map(label => {
            const entry = { label };
            planNames.forEach(planName => {
                entry[planName] = 0;
            });
            return entry;
        });
        result.forEach(doc => {
            const label = labelFormatter(doc);
            const planName = planIdToName[doc._id.planId?.toString()] || 'Unknown';
            const entry = chartData.find(e => e.label === label);
            if (entry && planNames.includes(planName)) {
                entry[planName] = doc.count;
            }
        });

        return res.status(200).json({
            data: chartData,
            status: 200,
            message
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
};

exports.mostWatched = async (req, res) => {
    // try {
    //     // Unwind views and group by month and type
    //     const result = await Movie.aggregate([
    //         { $unwind: "$views" },
    //         {
    //             $group: {
    //                 _id: {
    //                     month: { $month: "$views.timestamp" },
    //                     type: "$type"
    //                 },
    //                 count: { $sum: 1 }
    //             }
    //         }
    //     ]);

    //     // Prepare month labels
    //     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    //     const chartData = monthNames.map((name, idx) => ({
    //         label: name,
    //         Movie: 0,
    //         Series: 0
    //     }));

    //     // Fill chartData with counts
    //     result.forEach(item => {
    //         const monthIdx = item._id.month - 1;
    //         if (item._id.type === "movie") {
    //             chartData[monthIdx].Movie = item.count;
    //         } else if (item._id.type === "webseries") {
    //             chartData[monthIdx].Series = item.count;
    //         }
    //     });

    //     return res.status(200).json({
    //         data: chartData,
    //         status: 200,
    //         message: "Most watched movies and series by month"
    //     });
    try {
        const filter = req.query.filter;
        const now = new Date();
        let matchStage = {};
        let groupStage, labelFormatter, labels, message;

        if (filter === 'today') {
            // Hourly for today
            const start = new Date(now.setHours(0, 0, 0, 0));
            const end = new Date(now.setHours(23, 59, 59, 999));
            matchStage = { "views.timestamp": { $gte: start, $lte: end } };
            groupStage = {
                _id: { hour: { $hour: "$views.timestamp" }, type: "$type" },
                count: { $sum: 1 }
            };
            labelFormatter = doc => doc._id.hour.toString().padStart(2, '0');
            labels = Array.from({ length: 24 }, (_, idx) => (idx + 1).toString().padStart(2, '0'));
            message = "Hourly most watched movies and series for today";
        } else if (filter === 'month') {
            // Daily for month
            const year = parseInt(req.query.year) || now.getFullYear();
            const month = parseInt(req.query.month) || (now.getMonth() + 1);
            const daysInMonth = new Date(year, month, 0).getDate();
            const start = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0, 23, 59, 59, 999);
            matchStage = { "views.timestamp": { $gte: start, $lte: end } };
            groupStage = {
                _id: { day: { $dayOfMonth: "$views.timestamp" }, type: "$type" },
                count: { $sum: 1 }
            };
            labelFormatter = doc => doc._id.day.toString().padStart(2, '0');
            labels = Array.from({ length: daysInMonth }, (_, idx) => (idx + 1).toString().padStart(2, '0'));
            message = `Daily most watched movies and series for ${year}-${month.toString().padStart(2, '0')}`;
        } else if (filter === 'all') {
            // Find min/max year
            const firstView = await Movie.aggregate([
                { $unwind: "$views" },
                { $sort: { "views.timestamp": 1 } },
                { $limit: 1 },
                { $project: { timestamp: "$views.timestamp" } }
            ]);
            const lastView = await Movie.aggregate([
                { $unwind: "$views" },
                { $sort: { "views.timestamp": -1 } },
                { $limit: 1 },
                { $project: { timestamp: "$views.timestamp" } }
            ]);
            if (!firstView.length || !lastView.length) {
                return res.status(200).json({ data: [], status: 200, message: 'No view data found' });
            }
            const firstYear = new Date(firstView[0].timestamp).getFullYear();
            const lastYear = new Date(lastView[0].timestamp).getFullYear();
            if (firstYear !== lastYear) {
                // Group by year
                groupStage = {
                    _id: { year: { $year: "$views.timestamp" }, type: "$type" },
                    count: { $sum: 1 }
                };
                labelFormatter = doc => doc._id.year.toString();
                labels = [];
                for (let y = firstYear; y <= lastYear; y++) {
                    labels.push(y.toString());
                }
                message = 'Yearly most watched movies and series for all years';
            } else {
                // Group by month for that year
                const year = firstYear;
                groupStage = {
                    _id: { month: { $month: "$views.timestamp" }, type: "$type" },
                    count: { $sum: 1 }
                };
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                labelFormatter = doc => monthNames[(doc._id.month || 1) - 1];
                labels = monthNames;
                message = `Monthly most watched movies and series for the only available year (${year})`;
            }
        } else {
            // Default: year, monthly
            const year = now.getFullYear();
            const start = new Date(year, 0, 1);
            const end = new Date(year, 11, 31, 23, 59, 59, 999);
            matchStage = { "views.timestamp": { $gte: start, $lte: end } };
            groupStage = {
                _id: { month: { $month: "$views.timestamp" }, type: "$type" },
                count: { $sum: 1 }
            };
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            labelFormatter = doc => monthNames[(doc._id.month || 1) - 1];
            labels = monthNames;
            message = `Monthly most watched movies and series for this year (${year})`;
        }

        // Aggregate
        const result = await Movie.aggregate([
            { $unwind: "$views" },
            ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
            { $group: groupStage },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 } }
        ]);

        // Build chart data
        const chartData = labels.map(label => ({
            label,
            Movie: 0,
            Series: 0
        }));
        result.forEach(doc => {
            const label = labelFormatter(doc);
            const entry = chartData.find(e => e.label === label);
            if (entry) {
                if (doc._id.type === "movie") entry.Movie = doc.count;
                if (doc._id.type === "webseries") entry.Series = doc.count;
            }
        });

        return res.status(200).json({
            data: chartData,
            status: 200,
            message
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: error.message });
    }
}