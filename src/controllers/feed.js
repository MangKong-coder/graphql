const path = require('path');
const fs = require('fs')

const { validationResult } = require('express-validator')

const io = require('../socket.js');
const Post = require('../models/post');
const User = require('../models/user')

const errorFunc = (err) => {
    if(!err.statusCode) {
        err.statusCode = 500;
    }
}

const postValidation = (post) => {
    if(!post) {
        const error = new Error("Couldn't find post!");
        error.statusCode = 404;
        throw error
    }
}

exports.getPosts = async (req, res, next) => {
    const currentPage = req.query.page || 1;
    const perPage = 2;
    try {
        const totalItems = await Post.find().countDocuments()
        const posts = await Post.find()
               .populate('creator')
               .sort({createdAt: -1})
               .skip((currentPage - 1) * perPage)
               .limit(perPage)
        res.status(200).json({
            posts: posts, 
            totalItems: totalItems
        })

    } catch (err) {
        errorFunc(err)
    next(err)
    }
}


exports.postPost = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const error = new Error('Validation failed, entered data is invalid.');
        error.statusCode = 422;
        throw error;
    }

    if(!req.file) {
        const error = new Error('No image provided.')
        error.statusCode = 422;
        throw error;
    }
    const imageUrl = req.file.path.replace("\\","/");
    const title = req.body.title;
    const content = req.body.content;
    const post = new Post({
        title: title, 
        content: content, 
        imageUrl: imageUrl,
        creator: req.userId   
    })
    try {
        await post.save()
        const user = await User.findById(req.userId)
        user.posts.push(post);
        await user.save()
        io.getIO().emit('posts', { action: 'create', post: {...post._doc, creator:{_id: req.userId, name: user.name}}})
        res.status(201).json({
            message: 'Post created successfully',
            post: post,
            creator: {
                _id: user._id, name: user.name
            }
            })
        } catch (err) {
            errorFunc(err)
            next(err)
        }

    }

    exports.getPost = async (req, res, next) => {
        const postId = req.params.postId;
        try  {
            const post = await Post.findById(postId)
            postValidation(post);
            res.status(200).json({
                message: 'Post fetched.', 
                post: post
            })
        } catch (err) {
            errorFunc(err)
            next(err)
        }
    }

    exports.updatePost = async (req, res, next) =>{
        const postId = req.params.postId;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const error = new Error('Validation failed, entered data is invalid.');
            error.statusCode = 422;
            throw error;
    }
        const title = req.body.title;
        const content = req.body.content;
        let imageUrl = req.body.image;
        if (req.file) {
            imageUrl =  req.file.path.replace("\\","/");
        }
        if(!imageUrl) {
            const error = new Error('No file picked');
            error.statusCode = 422;
            throw error
        }
        try {
            const post = await Post.findById(postId).populate('creator')
            postValidation(post)
            if (post.creator._id.toString() !== req.userId) {
                const error = new Error ('Not authenticated')
                error.statusCode = 403;
                throw error
            }
            if (imageUrl !== post.imageUrl) {
                clearImage(post.imageUrl)
            }
            post.title = title;
            post.image = imageUrl;
            post.content = content;
            const result = await post.save()
            io.getIO().emit('posts', { action: 'update', post: result })
            res.status(200).json({
                message: 'Post Updated!',
                post: result
            })
        } catch (err) {
            errorFunc(err)
            next(err)
        }
    };

    

    exports.deletePost = async (req, res, next) => {
        const postId = req.params.postId;
        try {
            const post = await Post.findById(postId)
            postValidation(post)
            if (post.creator.toString() !== req.userId) {
                const error = new Error ('Not authenticated')
                error.statusCode = 403;
                throw error
            }
            clearImage(post.imageUrl)
            const result = await Post.findByIdAndRemove(postId)
            const user = await User.findById(req.userId)
            await user.posts.pull(postId)
            await user.save()
            io.getIO().emit('posts', { action: 'delete', post: postId })
            res.status(200).json({
                message: 'Deleted Post'
            })
        } catch (err) {
            errorFunc(err)
            next(err)
        }
    }

    exports.getStatus = async (req, res, next) => {
        let status;
        try {
            const user = await User.findById(req.userId)
            if (!user) {
                const error = new Error('Not authenticated')
                error.statusCode = 401;
                throw error;
            }
            status = user.status;
            res.status(200).json({status : status})
        } catch (err) {
            errorFunc(err)
            next(err)
        }

}

    exports.updateStatus = async (req, res, next) => {
        const status = req.body.status
        let updatedStatus
        try {
            const user = await User.findById(req.userId)
            if (!user) {
                const error = new Error('Not authenticated')
                error.statusCode = 401;
                throw error;
            }
            updatedStatus = user.status = status
            user.save();
            res.status(201).json({
                message: 'Status updated!'})
            } catch (err) {
            errorFunc(err)
            next(err)
        }

    }

    const clearImage = filePath => {
        filePath = path.join(__dirname, '..', filePath);
        fs.unlink(filePath, err => {console.log(err)})
    }