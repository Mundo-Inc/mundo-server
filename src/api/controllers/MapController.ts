import axios from "axios";
import type { NextFunction, Request, Response } from "express";
import { query, type ValidationChain } from "express-validator";
import { StatusCodes } from "http-status-codes";

import strings from "../../strings";
import { createError, handleInputErrors } from "../../utilities/errorHandlers";
import validate from "./validators";

const API_KEY = process.env.GOOGLE_GEO_API_KEY!;

export const getGeoLocationValidation: ValidationChain[] = [
  validate.lng(query("lng").optional()),
  validate.lat(query("lat").optional()),
  query("address").optional().isString(),
];
export async function getGeoLocation(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    handleInputErrors(req);

    const { lng, lat, address } = req.query;

    let url;
    if (address) {
      url = `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${API_KEY}`;
    } else if (lat && lng) {
      url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`;
    } else {
      throw createError(strings.validations.invalidType, 400);
    }

    const response = await axios(url);
    const data = await response.data;

    if (!data.results[0]) {
      throw createError(strings.data.noResult, 404);
    }

    const responseData = data.results[0];

    let theAddress = [];
    let postal_code, state, city, country;
    let addressComplete = false;

    for (let i = 0; i < responseData.address_components.length; i++) {
      const component = responseData.address_components[i];
      if (component.types.includes("street_number")) {
        theAddress.push(component.short_name);
      } else if (component.types.includes("route")) {
        addressComplete = true;
        theAddress.push(component.short_name);
      } else if (component.types.includes("administrative_area_level_4")) {
        if (!addressComplete) {
          theAddress.push(component.short_name);
        }
      } else if (component.types.includes("administrative_area_level_3")) {
        if (!addressComplete) {
          theAddress.push(component.short_name);
        }
      } else if (component.types.includes("administrative_area_level_2")) {
        if (!addressComplete) {
          theAddress.push(component.short_name);
        }
      } else if (component.types.includes("postal_code")) {
        postal_code = component.long_name;
      } else if (component.types.includes("locality")) {
        city = component.long_name;
      } else if (component.types.includes("country")) {
        country = component.long_name;
      } else if (component.types.includes("administrative_area_level_1")) {
        state = component.long_name;
      }
    }

    if (!city) {
      city = state;
    }

    res.status(StatusCodes.OK).json({
      fullAddress: responseData.formatted_address,
      address: theAddress.join(" "),
      postal_code: postal_code,
      country: country,
      state,
      city,
      lat: responseData.geometry.location.lat,
      lng: responseData.geometry.location.lng,
    });
  } catch (err) {
    next(err);
  }
}
