const mongoose = require("mongoose");
const Premium = require("../models/premium.Model");
const Payment = require("../models/payment.model");
const { ThrowError } = require("../utils/ErrorUtils");
const { invalidateCache } = require("../middleware/cache");

exports.getallPremium = async (req, res) => {
  try {
    const data = await Premium.find();

    if (!data || data.length === 0) {
      return res.status(200).json({
        message: "No premium plans found!",
        data: [],
      });
    }

    // Fetch all payments
    const payments = await Payment.find();

    // Count occurrences of each planId
    const planIdCount = {};
    payments.forEach((payment) => {
      const planId = payment.planId?.toString();
      if (planId) {
        planIdCount[planId] = (planIdCount[planId] || 0) + 1;
      }
    });

    // Find the most-used planId
    let mostUsedPlanId = null;
    let maxCount = 0;
    for (const [planId, count] of Object.entries(planIdCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostUsedPlanId = planId;
      }
    }

    // Add 'popular' property to the most-used plan
    const dataWithPopular = data.map((plan) => {
      const planObj = plan.toObject();
      if (plan._id.toString() === mostUsedPlanId) {
        planObj.popular = true;
      } else {
        planObj.popular = false;
      }
      return planObj;
    });

    return res.status(200).json({
      message: "Premium plans fetched successfully",
      data: dataWithPopular,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.createPremium = async (req, res) => {
  try {
    const { plan, price, period, features } = req.body;
    // console.log(req.body);

    if (!plan || price === undefined || price === null || !period) {
      return ThrowError(res, 400, "Plan, price, and period are required!");
    }

    const existingPlan = await Premium.findOne({ plan });
    if (existingPlan) {
      return ThrowError(res, 400, "A plan with this name already exists!");
    }

    const premiumData = new Premium({
      plan,
      price,
      period,
      features: features || [],
    });

    const saveData = await premiumData.save();

    await invalidateCache("cache:GET:/api/getallPremium");

    return res.status(201).json({
      message: "Premium plan created successfully",
      data: saveData,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.updatePremium = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, price, period, features } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ThrowError(res, 400, "Invalid premium plan ID");
    }

    const existinplan = await Premium.findById(id);
    if (!existinplan) {
      return ThrowError(res, 404, "Premium plan not found");
    }

    if (plan && plan !== existinplan.plan) {
      const planExists = await Premium.findOne({ plan, _id: { $ne: id } });
      if (planExists) {
        return ThrowError(res, 400, "A plan with this name already exists!");
      }
    }

    const updateData = {};
    if (plan) updateData.plan = plan;
    if (price !== undefined) updateData.price = price;
    if (period) updateData.period = period;

    if (features) {
      // Process features array to handle new features without IDs
      const processedFeatures = features.map((feature) => {
        const processedFeature = {
          name: feature.name,
          description: feature.description || "",
          included: feature.included !== undefined ? feature.included : true,
        };

        // Only include _id if it exists and is valid
        if (feature._id && mongoose.Types.ObjectId.isValid(feature._id)) {
          processedFeature._id = feature._id;
        } else {
          // Generate new ObjectId for new features
          processedFeature._id = new mongoose.Types.ObjectId();
        }

        return processedFeature;
      });

      updateData.features = processedFeatures;
    }

    const updatedData = await Premium.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    await invalidateCache("cache:GET:/api/getallPremium");

    return res.status(200).json({
      message: "Premium plan updated successfully",
      data: updatedData,
    });
  } catch (error) {
    console.error("Error updating premium plan:", error);
    return ThrowError(res, 500, error.message);
  }
};

exports.deletePremium = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ThrowError(res, 400, "Invalid premium plan ID");
    }

    const deletedPlan = await Premium.findByIdAndDelete(id);

    if (!deletedPlan) {
      return res.status(404).json({
        success: false,
        message: "Premium plan not found",
      });
    }

    await invalidateCache("cache:GET:/api/getallPremium");

    return res.status(200).json({
      success: true,
      message: "Premium plan deleted successfully",
      data: deletedPlan,
    });
  } catch (error) {
    return ThrowError(res, 500, error.message);
  }
};

exports.getPremiumById = async (req, res) => {
  try {
    const { id } = req.params

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(200).json({
        message: "Object Id is not vaild"
      })
    }

    const premium = await Premium.findOne({ _id: id });

    return res.status(200).json({
      success: true,
      message: "Premium Get successfully",
      premium
    })

  } catch (error) {
    console.log("error while get Premium By ID", error);
    return res.status(500).json({
      success: false,
      message: "Error while get premium By Isd"
    })
  }
}

exports.updateFeatureDescription = async (req, res) => {
  const { id } = req.params;
  const { plan, featureName, description } = req.body; // Changed from planName to plan

  try {
    // Find the plan by id
    const planDoc = await Premium.findById(id);
    if (!planDoc) return res.status(404).json({ message: "Plan not found" });

    // Find the feature and update its description
    const feature = planDoc.features.find((f) => f.name === featureName);
    if (!feature) {
      // If feature doesn't exist, add it
      planDoc.features.push({
        name: featureName,
        description: description,
        // _id: new mongoose.Types.ObjectId()
      });
    } else {
      // Update existing feature
      feature.description = description;
    }

    await planDoc.save();
    await invalidateCache("cache:GET:/api/getallPremium");
    res.json({ message: "Description updated", plan: planDoc });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
