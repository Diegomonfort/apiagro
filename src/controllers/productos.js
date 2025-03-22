const supabase = require('../config/supabase');


   const getProducts = async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('productos') 
        .select('*');
  
      if (error) {
        throw error;
      }
      res.json(data);
    } catch (error) {
      console.error('Error al obtener los productos:', error);
      res.status(500).json({ error: 'Error al obtener los productos.' });
    }
  };
  

    const getProductsDestacados = async (req, res) => {
        try {
        const { data, error } = await supabase
            .from('productos') 
            .select('*')
            .eq('destacados', true);
    
        if (error) {
            throw error;
        }
        res.json(data);
        } catch (error) {
        console.error('Error al obtener los productos:', error);
        res.status(500).json({ error: 'Error al obtener los productos.' });
        }
    };
    

     const getProductById = async (req, res) => {
      const { id } = req.params;  // Obtener el id del parámetro de la URL
    
      try {
        const { data, error } = await supabase
          .from('productos')  // Tabla de productos
          .select('*')        // Seleccionar todos los campos
          .eq('id', id)       // Filtrar por el ID del producto
          .single();          // Obtener solo un producto
    
        if (error) {
          throw error;
        }
    
        res.json(data);  // Devolver el producto encontrado
      } catch (error) {
        console.error('Error al obtener el producto:', error);
        res.status(500).json({ error: 'Error al obtener el producto.' });
      }
    };
  
  
     const createProduct = async (req, res) => {
      const { name, price, description } = req.body;
    
      if (!name || !price) {
        return res.status(400).json({ error: 'Nombre y precio son requeridos' });
      }
    
      try {
        const { data, error } = await supabase
          .from('productos')
          .insert([{ name, price, description }]);
    
        if (error) {
          throw error;
        }
    
        res.status(201).json(data);
      } catch (error) {
        console.error('Error al crear el producto:', error);
        res.status(500).json({ error: 'Error al crear el producto.' });
      }
    };
  

    const updateProduct = async (req, res) => {
        const { id } = req.params;
        const {
            Producto,
            Precio,
            Descripción,
            IVA,
            Familia,
            Subsección,
            Modelo,
            Marca,
            Categoria,
            activo,
            destacados
        } = req.body;
    
        try {
            const { data: currentProduct, error: fetchError } = await supabase
                .from('productos')
                .select('*')
                .eq('id', id)
                .single();
    
            if (fetchError) {
                console.error('Error al obtener el producto:', fetchError.message);
                return res.status(404).json({ error: 'Producto no encontrado.' });
            }
    
            const updateData = {
                ...(Producto && { Producto }),
                ...(Precio && { Precio: parseFloat(Precio) }),
                ...(Descripción && { Descripción }),
                ...(IVA && { IVA: parseFloat(IVA) }),
                ...(Familia && { Familia }),
                ...(Subsección && { Subsección }),
                ...(Modelo && { Modelo }),
                ...(Marca && { Marca }),
                ...(Categoria && { Categoria }),
                ...(activo !== undefined && { activo: !currentProduct.activo }),
                ...(destacados !== undefined && { destacados: !currentProduct.destacados })
            };
    
            if (updateData.Precio && isNaN(updateData.Precio)) delete updateData.Precio;
            if (updateData.IVA && isNaN(updateData.IVA)) delete updateData.IVA;
    
            // Manejo de la imagen
            if (req.file) {
                const fileName = `${Date.now()}-${req.file.originalname}`;
                const { data: uploadData, error: uploadError } = await supabase
                    .storage
                    .from('fotosProductos')
                    .upload(`productos/${fileName}`, req.file.buffer, {
                        contentType: req.file.mimetype,
                        cacheControl: '3600',
                        upsert: true,
                    });
    
                if (uploadError) {
                    console.error('Error al subir la imagen:', uploadError.message);
                    return res.status(500).json({ error: 'Error al subir la imagen al bucket.' });
                }
    
                const { data: publicUrlData } = supabase
                    .storage
                    .from('fotosProductos')
                    .getPublicUrl(`productos/${fileName}`);
    
                updateData.Imagen = publicUrlData.publicUrl;
            }
    
            const { data, error } = await supabase
                .from('productos')
                .update(updateData)
                .eq('id', id);
    
            if (error) {
                console.error('Error al actualizar el producto:', error.message);
                return res.status(500).json({ error: 'Error al actualizar el producto.' });
            }
    
            res.status(200).json({ message: 'Producto actualizado correctamente', data });
        } catch (error) {
            console.error('Error general:', error.message);
            res.status(500).json({ error: 'Error al actualizar el producto.' });
        }
    };
  

     const deleteProduct = async (req, res) => {
      const { id } = req.params;
    
      try {
        const { data, error } = await supabase
          .from('productos')
          .delete()
          .eq('id', id);
    
        if (error) {
          throw error;
        }
    
        res.status(200).json({ message: 'Producto eliminado correctamente' });
      } catch (error) {
        console.error('Error al eliminar el producto:', error);
        res.status(500).json({ error: 'Error al eliminar el producto.' });
      }
    };
  
  
  
  
module.exports = {
    getProducts,
    getProductsDestacados,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};
  
 